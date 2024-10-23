#!/bin/sh

LSOF_PATHS=$(lsof -p $$ -Fn0 2>/dev/null | tail -1);
SCRIPT_PATH=${LSOF_PATHS#n};
SCRIPT_DIR=$(dirname $SCRIPT_PATH);

cd $SCRIPT_DIR

EMS_PATH=/usr/lib/emscripten;
USE_DOCKER=false;
SHOW_HELP=false;

usage()
{
	echo "Usage: $0 [option]..."
	echo "  options:"
	echo "    -e, --emscripten-path=LIB_PATH  emscripten lib path."
	echo "                                    default: '/usr/lib/emscripten'"
	echo "    -d, --docker                    run emscripten via docker even"
	echo "                                    if it is installed locally."
	echo "    -h, --help,                     show help.";

	exit 1;
}

PARSED_ARGS=$(getopt -n "$0" -o e:dh --long emscripten-path:docker,help -- "$@");
[ $? -ne 0 ] && usage;
eval set -- "$PARSED_ARGS";
while true; do
	case "$1" in
		-e|--emscripten-path)   EMS_PATH="$2";   shift 2 ;;
		-d|--docker)            USE_DOCKER=true; shift ;;
		-h|--help)              SHOW_HELP=true;  shift ;;
		--) shift; break ;;
		*) printf "Option '$1' is not valid!\n"; usage ;;
	esac
done

[ "$SHOW_HELP" = true ] && usage;

build_aborted()
{
	printf "Build aborted.\n";
	exit 1;
}

echo "Building tree-sitter-c3.wasm in '$SCRIPT_DIR/docs/tree-sitter-c3.wasm"

if [ "$USE_DOCKER" = true ] ; then
	tree-sitter build -d -w -o ./docs/playground/tree-sitter-c3.wasm;
	[ $? -ne 0 ] && build_aborted;
else
	PATH=$PATH:$EMS_PATH tree-sitter build -w -o ./docs/playground/tree-sitter-c3.wasm;
	[ $? -ne 0 ] && build_aborted;
fi


