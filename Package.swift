// swift-tools-version:5.3

import Foundation
import PackageDescription

var sources = ["src/parser.c"]
if FileManager.default.fileExists(atPath: "src/scanner.c") {
    sources.append("src/scanner.c")
}

let package = Package(
    name: "TreeSitterC3",
    products: [
        .library(name: "TreeSitterC3", targets: ["TreeSitterC3"]),
    ],
    dependencies: [
        .package(name: "SwiftTreeSitter", url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.9.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterC3",
            dependencies: [],
            path: ".",
            sources: sources,
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift",
            cSettings: [.headerSearchPath("src")]
        ),
        .testTarget(
            name: "TreeSitterC3Tests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterC3",
            ],
            path: "bindings/swift/TreeSitterC3Tests"
        )
    ],
    cLanguageStandard: .c11
)
