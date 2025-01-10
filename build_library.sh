#!/bin/sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd $SCRIPT_DIR;

LIB_NAME="libtree-sitter-c3";
LIB_SHARED=false;
LIB_STATIC=false;
AUTO_YES=false;
SHOW_HELP=false;

usage()
{
	echo "Usage: $0 [option]..."
	echo "  options:"
	echo "    -n, --name=NAME  library output prefix name. "
	echo "                       default: '$LIB_NAME'"
	echo "    -s, --shared,    building shared library."
	echo "                       if neither --shared and --static are provided"
	echo "                       default: true"
	echo "    -a, --static,    building static library."
	echo "    -y, --yes,       disable user prompt."
	echo "    -h, --help,      show help.";

	exit 1;
}

PARSED_ARGS=$(getopt -n "$0" -o n:sayh --long name:,shared,static,yes,help -- "$@");
[ $? -ne 0 ] && usage;
eval set -- "$PARSED_ARGS";
while true; do
	case "$1" in
		-n|--name)   LIB_NAME="$2";   shift 2 ;;
		-s|--shared) LIB_SHARED=true; shift ;;
		-a|--static) LIB_STATIC=true; shift ;;
		-y|--yes)    AUTO_YES=true;   shift ;;
		-h|--help)   SHOW_HELP=true;  shift ;;
		--) shift; break ;;
		*) printf "Option '$1' is not valid!\n"; usage ;;
	esac
done

[ "$SHOW_HELP" = true ] && usage;
[ "$LIB_SHARED" = false ] && [ "$LIB_STATIC" = false ] && LIB_SHARED=true;

build_aborted()
{
	echo "Build aborted.";
	exit 1;
}

if [ -z "$LIB_NAME" ]; then
  echo "--name is not valid!";
  build_aborted;
fi

create_build_dir()
{
	mkdir "$SCRIPT_DIR/build";
	if [ $? -ne 0 ]; then
	  echo "Directory creation failed!";
	  build_aborted;
	fi
}

if [ ! -d "$SCRIPT_DIR/build" ] ; then
	if [ "$AUTO_YES" = true ] ; then
		create_build_dir;
	else
		printf "Directory '%s' doesn't exist!\n%s" \
			"$SCRIPT_DIR/build" \
			"Create the directory? (y/n) [y]:"
		read RES;

		if [ -z "$RES" ]; then
			RES='y'
		fi

		if [ "$RES" = "y" ] || [ "$RES" = "Y" ] ; then
			create_build_dir;
		else
			build_aborted;
		fi
	fi
fi

echo "Generating tree-sitter-c3"
tree-sitter generate;
[ $? -ne 0 ] && build_aborted;

if [ "$LIB_SHARED" = true ] ; then
	echo "Building $LIB_NAME shared lib in '$SCRIPT_DIR/build/$LIB_NAME.so"
	tree-sitter build -o ./build/$LIB_NAME.so;
fi

if [ "$LIB_STATIC" = true ] ; then
	echo "Building $LIB_NAME static lib in '$SCRIPT_DIR/build/$LIB_NAME.a"
	# tree-sitter build -o ./build/$LIB_NAME.a;
	cc -c -fPIC -fno-exceptions -O2 -I ./src \
		-o ./build/parser.o -xc ./src/parser.c
	[ $? -ne 0 ] && build_aborted;

	cc -c -fPIC -fno-exceptions -O2 -I ./src \
		-o ./build/scanner.o -xc ./src/scanner.c
	[ $? -ne 0 ] && build_aborted;

	[ -f "./build/$LIB_NAME.a" ] && rm "./build/$LIB_NAME.a"

	ar rcs ./build/$LIB_NAME.a ./build/parser.o ./build/scanner.o
	[ $? -ne 0 ] && build_aborted;

	rm ./build/parser.o ./build/scanner.o
fi
