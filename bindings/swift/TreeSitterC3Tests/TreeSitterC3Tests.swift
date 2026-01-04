import XCTest
import SwiftTreeSitter
import TreeSitterC3

final class TreeSitterC3Tests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_c3())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading C3 grammar")
    }
}
