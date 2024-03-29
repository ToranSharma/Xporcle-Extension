Changelog
=========

[Unreleased]
------------
-

[v2.3.1] - 2021-08-16
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v2.3.0)
### Fixed
- Add quiz to poll button.

[v2.3.0] - 2021-08-16
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v2.3.0)
### Added
- Quiz Queue
  - Button for hosts to add the quiz they are on to the queue.
  - Draggable (for hosts) list of quizzes in the queue.
  - Remove button for hosts to remove quizzes from the queue.
  - Go to quiz button for hosts to visit the page of quizzes in the queue.
  - Controls for hosts to toggle and customise interval for auto changing to
    next quiz.
	- Option to set default interval for auto changing.
    - Countdown under leaderboard displaying time left until change to next
    quiz.
    - Button to cancel the countdown for hosts.
- Option to set default duration for next quiz polls.

[v2.2.0] - 2021-08-16
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v2.2.0)
### Added
- Close button to Create Poll and Vote Info boxes.
- Collapse toggles to Create Poll and vote Info boxes.

### Changed
- Xporcle interface now scrollable if longer than available space.

[v2.1.0] - 2021-08-14
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v2.1.0)
### Added
- Poll feature to vote for next quiz.
  - Interface for hosts to create a poll together.
  - Popup box for users to submit their votes.
  - Vote progress information box.

### Changed
- Moved styling into external stylesheets.

[v2.0.0] - 2021-03-22
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v2.0.0)
### Added
- Remove player option in leaderboard right click menu.

### Changed
- Updated server communications to work with new Quart-WebSocketRooms based API.

[v1.2.1] - 2020-12-24
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v1.2.1)
### Fixed
- Start detection for non hosts.
- Start countdown button styling.
- Suggestion clearing to stay after changing page.

[v1.2.0] - 2020-12-23
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v1.2.0)
### Fixed
- Crossword type quiz start detection.

### Added
- Auto inputting of room code from url's hash.
  - Auto joining of room if default username is set.
- Countdown before quiz is started.
- Button clear to the suggestion list.

### Changed
- Link with room code in hash is put in clipboard rather than just the room
  code on creating a room.

[v1.1.1] - 2020-05-29
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v1.1.1)
### Fixed
- Handling of host changing when not on a quiz.
- Save room button is now removed when player is removed from being a host.
- Save room button is now added when a player is promoted to being a host.

### Changed
- Styling of form headers and buttons.

[v1.1.0] - 2020-05-28
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v1.1.0)
### Added
- Ability to save the state of the room under a custom name.
- Ability to load a room from a saved state.
- Ability to delete saved rooms in the options popup window.
- Ability to rename saved rooms in the options popup window.

[v1.0.1] - 2020-05-27
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v1.0.1)
### Fixed
- Error handling of invalid room code, or taken username when joining a room.

[v1.0.0] - 2020-05-25
---------------------
[GitHub Release Page](https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v1.0.0)
### Added
- Options to the options page and page action popout window.
  - Option to auto fill a custom default username in the create and join room
    forms.
  - Option to blur out the room code, maybe useful if streaming a private room.
  - Options script to handle the changing and saving of the options.
  - Options page stylesheet.
- Button to suggest a quiz to hosts.
- List of suggestions from other players for hosts to look at.
- Handling of being promoted to a host.
- Handling of being removed as a host.
- Custom context menu for hosts to promote other users to a host.

## Changed
- Websocket server url changed to toransharma.com/xporcle.
- Leaderboard now includes a wins column, and points ties are decided by wins.

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
[v2.3.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v2.2.0...v2.3.0
[v2.2.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v2.1.0...v2.2.0
[v2.1.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v2.0.0...v2.1.0
[v2.0.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v1.2.1...v2.0.0
[v1.2.1]: https://github.com/ToranSharma/Xporcle-Extension/compare/v1.2.0...v1.2.1
[v1.2.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v1.1.1...v1.2.0
[v1.1.1]: https://github.com/ToranSharma/Xporcle-Extension/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v1.0.1...v1.1.0
[v1.0.1]: https://github.com/ToranSharma/Xporcle-Extension/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/ToranSharma/Xporcle-Extension/compare/v0.0.2...v1.0.0
[v0.0.2]: https://github.com/ToranSharma/Xporcle-Extension/compare/v0.0.1...v0.0.2
[v0.0.1]: https://github.com/ToranSharma/Xporcle-Extension/releases/tag/v0.0.1
