Changelog
=========

[Unreleased]
------------
-

[v0.0.2] - 2020-05-19
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v0.0.2)
### Added
- Gecko browser specific settings extension ID for future Firefox storage API
  support.
- Sending of a connection closed message from the background script to the
  content script.
- Corresponding connection close message handing in the content script.
- Handling of quiz finished message to update internal state of the background
  script.

### Fixed
- Handling of changing page while a quiz is being played.
- Resetting of internal state variables in background script.
- Missing declaration of interfaceContainer.
- Width of interfaceBox to account for differing scroll bar size in Firefox.
- Handling of start quiz messages when quiz is already running. This only really
  affects the host of a room.
- Clipboard writing to support Firefox.

### Changed
- Content script renamed from script.js to xporcle.js.

### Removed
- Debugging console messages from content and background scripts.

[v0.0.1] - 2020-05-18
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v0.0.1)
### Added
- README
- GNU GPLv3 License
- This changelog
- Manifest
- Content script. This handles the addition of the user interface and the
  processing of messages from the server.
- Background script. This handles to connection to the server and relays
  message sending between the content script and the server.
- Options page popup placeholder.

[Unreleased]: https://github.com/ToranSharma/Xporcle-Extension/compare/master...develop
[v0.0.2]: https://github.com/ToranSharma/Xporcle-Extension/compare/v0.0.1...v0.0.2
[v0.0.1]: https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v0.0.1
