#!/bin/sh
PATH=$PATH:/usr/lib/emscripten/ tree-sitter build-wasm && mv tree-sitter-c3.wasm docs/playground
