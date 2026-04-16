module test_stdlib;
import std::io, std::collections, std::os::process;
import ts, tree_sitter_c3;

// Files that C3C parses without error but tree-sitter-c3 doesn't
const String[*] IGNORED_FILES = { "DUMMY_IGNORE" };

Path compiler_path;
uint total_count;
uint failed_count;

fn int main(String[] args) {
  if (args.len < 3) {
    io::printn("ERROR: Expected the c3c executable as first argument, followed by directories");
    return 1;
  }

  Path? c3c_executable = path::temp(args[1]);
  if (catch c3c_executable) {
    io::printn("ERROR: Invalid path to c3c executable");
    return 1;
  }

  if (!path::exists(c3c_executable)) {
    io::printfn("ERROR: '%s' does not exist", c3c_executable);
    return 1;
  }

  compiler_path = c3c_executable;

  TSParser* parser = parser::new_with_language(tree_sitter_c3::language())!!;
  defer parser::delete(parser);

  foreach (arg : args[2..]) {
    if (try Path base_dir = path::temp(arg)) {
      // io::printfn("Parsing files in %s", base_dir);
      if (catch err = base_dir.walk(fn bool? (Path path, bool is_dir, void* user_data) {
        // if (is_dir) io::printfn("Parsing files in %s", path);
        if (path.has_suffix(".c3") || path.has_suffix(".c3i") || path.has_suffix(".c3t")) {
          process_file(path.str_view(), user_data);
        }
        return false;
      }, parser)) {
        io::printfn("ERROR: Could not traverse '%s' (%s)", base_dir, err);
        return 1;
      }
    } else {
      io::printfn("ERROR: Invalid path '%s", arg);
      return 1;
    }
  }

  if (failed_count) {
    io::printfn("FAILED parsing %d files with %d errors", total_count, failed_count);
    return 1;
  } else {
    io::printfn("Parsed %d files without errors", total_count);
    return 0;
  }
}

fn bool ignore_file(String file_path) {
  foreach (file : IGNORED_FILES) {
    if (file_path.ends_with(file)) {
      return true;
    }
  }
  return false;
}

typedef NullSink (OutStream) = void*;

fn usz? NullSink.write(&self, char[] bytes) @dynamic {
  return bytes.len;
}

fn void? NullSink.write_byte(&self, char c) @dynamic {}

fn void process_file(String file_path, TSParser* parser) => @pool() {
  if (ignore_file(file_path)) return;

  // io::printfn("Checking %s", file_path);

  total_count += 1;

  char[] data = file::load_temp(file_path)!!;

  TSTree* tree = parser::parse_string(parser, null, (String)data);
  defer ts::tree_delete(tree);
  TSNode root_node = ts::tree_root_node(tree);
  assert(!ts::node_is_null(root_node));

  if (ts::node_has_error(root_node)) {
    // Check if C3C parses the file
    String[] cmdline = {
      compiler_path.str_view(),
      "-P",
      "compile-only",
      file_path,
    };

    // io::printfn("Running %s", cmdline);

    Process process = process::spawn(cmdline, SpawnOptions.NO_WINDOW)!!;
    defer process.destroy();

    NullSink out;
    io::copy_to(&&process.stdout(), &out)!!;
    io::copy_to(&&process.stderr(), &out)!!;

    CInt result = process.join()!!;

    if (result == 0) {
      io::printfn("Error parsing '%s'", file_path);
      failed_count += 1;
    }
  }
}
