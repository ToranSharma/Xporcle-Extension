let port = null;

let onQuizPage = null;
let interfaceBox = null;
let interfaceContainer = null;
let roomCode = null;
let username = null;
let host = null;
let urls = {};
let hosts = [];
let suggestions = [];
let voted = false;

let quizStartTime = null;
let quizRunning = false;

let options = {};

let confirmSaveDataRecieved = null;
let saveData = null;
let saveName = null;

const quizStartObserver = new MutationObserver(quizStarted);
const scoreObserver = new MutationObserver(() => sendLiveScore());
const quizFinishObserver = new MutationObserver(quizFinished);


if (document.readyState === "complete" || document.readyState === "interactive")
{
	run();
}
else
{
	document.addEventListener("DOMContentLoaded", run);
}


let con = true; // To stop debug erros on reloading extension

window.onunload = function ()
{
	if (con) chrome.runtime.sendMessage({type: "pageClosed"});
}

function run()
{
	chrome.runtime.sendMessage({type: "showPageAction"});
	chrome.runtime.onMessage.addListener(
		(message) =>
		{
			if (message.type === "optionsChanged")
			{
				retrieveOptions().then(
					() =>
					{
						applyOptionsChanges();
					}
				);
			}
			else if (message.type === "savesChanged")
			{
				const loadRoomForm = document.querySelector(`#loadRoomForm`);
				if (loadRoomForm !== null)
				{
					chrome.storage.sync.get("saves",
						(data) =>
						{
							let storedSaveNames;
							if (Object.keys(data).length === 0)
							{
								storedSaveNames = [];
							}
							else
							{
								storedSaveNames = Object.keys(data.saves);
							}

							loadRoomForm.remove();
							addLoadRoomForm(storedSaveNames);
						}
					);
				}
			}
		}
	);
	port = chrome.runtime.connect({name: "messageRelay"});
	port.onDisconnect.addListener(
		() =>
		{
			con = false;
			chrome.runtime.sendMessage({type: "pageClosed"});
		}
	);
	if (/^\/games\//.test(window.location.pathname))
	{
		onQuizPage = true;
	}
	else
	{
		onQuizPage = false;
	}
	retrieveOptions().then(
		init
	);
}

async function init()
{
	// Add UI Container
	addInterfaceBox();

	// Check to see if we are still connected to a room
	const statusResponse = await new Promise(
		(resolve, reject) =>
		{
			let statusChecker;
			port.onMessage.addListener(
				statusChecker = (message) =>
				{
					port.onMessage.removeListener(statusChecker);
					resolve(message);
				}
			);
			port.postMessage({type: "connectionStatus", url: window.location.pathname});
		}
	);

	if (statusResponse.connected)
	{
		// We are already connected to a room
		roomCode = statusResponse["room_code"];
		username = statusResponse["username"];
		host = statusResponse["host"];
		urls = statusResponse["urls"];
		hosts = statusResponse["hosts"];
		suggestions = statusResponse["suggestions"];
		saveName = statusResponse["saveName"];
		voted = statusResponse["voted"];

		const pollData =  Object.keys(statusResponse["poll_data"]).length !== 0 ? statusResponse["poll_data"] : undefined;
		const voteData =  Object.keys(statusResponse["vote_data"]).length !== 0 ? statusResponse["vote_data"] : undefined;
		onRoomConnect(statusResponse["scores"], pollData, voteData);
	}
	else
	{
		// Not connected so add room forms
		addCreateRoomForm();
		addJoinRoomForm();

		// Get the stored save names
		const storedSaveNames = await new Promise(
			(resolve, reject) =>
			{
				chrome.storage.sync.get("saves",
					(data) =>
					{
						if (Object.keys(data).length === 0)
						{
							resolve([]);
						}
						else
						{
							resolve(Object.keys(data["saves"]));
						}
					}
				)
			}
		);
		addLoadRoomForm(storedSaveNames);

		// Respond to code appended to url
		const xporcleCode = (window.location.hash.search(/#xporcle:/) === 0) ? window.location.hash.split(":")[1] : null;
		if (xporcleCode !== null)
		{
			document.querySelector("#joinRoomCodeInput").value = xporcleCode;
			window.location.hash = "";
			const usernameInput = document.querySelector("#joinRoomUsernameInput");
			if (usernameInput.value === "Enter Username")
			{
				usernameInput.focus();
			}
			else
			{
				// Default username must have been input so we can just connect.
				usernameInput.parentNode.requestSubmit();
			}
		}

	}
}

function retrieveOptions()
{
	return new Promise(function (resolve, reject){
		chrome.storage.sync.get("options", function (data)
		{
			// Set options to default settings
			options =
				{
					useDefaultUsername: false,
					defaultUsername: "",
					blurRoomCode: false
				};

			if (Object.entries(data).length === 0)
			{
				// First time using version with options so nothing is set in storage.
			}
			else
			{
				// We have loaded some options,
				// let's apply them individually in case new options have been added since last on the options page
				for (let option in data.options)
				{
					if (data.options.hasOwnProperty(option))
						options[option] = data.options[option];
				}
			}
			// Now let's save the options for next time.
			chrome.storage.sync.set({"options": options});
			resolve();
		});
	});
}

function applyOptionsChanges()
{
	// Default Username
	const forms = interfaceBox.querySelectorAll(`form`)
	if (forms.length !== 0)
	{
		document.querySelectorAll(`#createRoomUsernameInput, #joinRoomUsernameInput`).forEach(
			(input) =>
			{
				if (options.useDefaultUsername && options.defaultUsername !== "")
				{
					input.value = options.defaultUsername;
					if (input.parentNode.id === "createRoomForm")
					{
						input.parentNode.querySelector(`[type="submit"]`).disabled = false;
					}
				}
				else
				{
					input.value = "Enter Username";
					input.parentNode.querySelector(`[type="submit"]`).disabled = true;
				}
			}
		);
	}

	// Blur Room Code
	const roomCodeHeader = document.querySelector(`#roomCodeHeader`);
	if (roomCodeHeader !== null)
	{
		const codeSpan = roomCodeHeader.lastChild;
		codeSpan.style.filter = (options.blurRoomCode) ? "blur(0.4em)" : "unset";
	}
}

function addInterfaceBox()
{
	const centerContent = document.querySelector(`#CenterContent`);

	const gameHeader = document.querySelector(`.game-header`);
	const staffPicks = document.querySelector(`#staff-picks-wrapper`);

	interfaceContainer = document.querySelector(`#interfaceContainer`);
	if (interfaceContainer === null)
	{
		interfaceContainer = document.createElement("div");
		interfaceContainer.id = "interfaceContainer";
		interfaceContainer.style =
		`
			position: sticky;
			top: 67px;
			margin-left: calc(100% + ${window.getComputedStyle(centerContent).paddingRight});
			height: 0;
			width: 0;
			overflow: visible;
			z-index: 999;
		`;

		if (gameHeader !== null)
		{
			gameHeader.parentNode.insertBefore(interfaceContainer, gameHeader.nextElementSibling);
		}
		else if (staffPicks !== null)
		{
			staffPicks.parentNode.insertBefore(interfaceContainer, staffPicks.nextElementSibling);
		}
		else
		{
			centerContent.insertBefore(interfaceContainer, centerContent.firstElementChild);
		}
	}

	if (document.querySelector(`#interfaceBox`) === null)
	{
		interfaceBox = document.createElement("div");
		interfaceBox.id = "interfaceBox";
		interfaceBox.style =
		`
			width: calc(((100vw - 960px) / 2 - 10px));
			padding: 0.5em;
			box-sizing: border-box;
			max-width: 400px;
			list-style: none;
			border-width: 1px;
			border-style: solid;
			border-color: darkgrey;
			border-radius: 0.25em;
			background-color: white;

			display: grid;
			row-gap: 1em;
			grid-template-columns: 100%;
		`;

		interfaceContainer.appendChild(interfaceBox);
	}
}

function resetInterface(errorElement, lastUsername, lastCode)
{
	quizStartObserver.disconnect();
	scoreObserver.disconnect();
	quizFinishObserver.disconnect();
	
	port.onMessage.removeListener(processMessage);

	code = null;
	username = null;
	host = null;
	urls = {};
	hosts = [];
	suggestions = [];

	saveData = null;
	saveName = null;

	Array.from(interfaceBox.childNodes).forEach(
		(element) => element.remove()
	);

	setQuizStartProvention(false);
	document.querySelectorAll("#startCountdown").forEach(elm => elm.remove());

	document.querySelector("#pollBox")?.remove();
	document.querySelector("#voteInfoBox")?.remove();
	document.querySelector("#ballotPopout")?.remove();

	init().then(
		() =>
		{
			if (errorElement !== undefined)
			{
				interfaceBox.appendChild(errorElement);
				if (lastUsername !== undefined)
				{
					document.querySelectorAll(`#createRoomUsernameInput, #joinRoomUsernameInput`).forEach(
						(input) =>
						{
							input.value = lastUsername;
						}
					);
				}
				if (lastCode !== undefined)
				{
					document.querySelector(`#joinRoomCodeInput`).value = lastCode;
				}
			}
		}
	);
}

function processMessage(message)
{
	messageType = message["type"];

	switch (messageType)
	{
		case "users_update":
			hosts = Object.entries(message["users"]).filter(entry => entry[1].host === true).map(entry => entry[0]);
		case "scores_update":
			updateLeaderboard(message["scores"]);
			break;
		case "room_closed":
			resetInterface();
			break;
		case "connection_closed":
			resetInterface();
			break;
		case "error":
			console.error(message["error"]);
			break;
		case "removed_from_room":
			const removedUser = message["username"];
			if (removedUser === username)
			{
				resetInterface();
			}
			else
			{
				delete urls[removedUser];
				delete hosts[removedUser];
			}
			break;
		case "save_room":
			if (confirmSaveDataRecieved !== null)
			{
				saveData = message["save_data"];
				saveData["me"] = username;
				confirmSaveDataRecieved();
			}
			break;
		case "hosts_update":
			if (message["added"] !== undefined)
			{
				hosts.push(message["added"]);
			}
			else
			{
				hosts = hosts.filter(username => username !== message["removed"]);
			}
			if (host && !hosts.includes(username))
			{
				// Not a host anymore
				host = false;
				
				// Remove host features
				setQuizStartProvention(true);

				urls = {};
				updateLeaderboardUrls();

				suggestions = [];
				document.querySelectorAll(`#changeQuizButton, #suggestionsHeader, #suggestionsList, #saveButton, #createPollButton`).forEach(element => element.remove());

				// Add non host features
				if (onQuizPage)
				{
					addSuggestionQuizButton();
				}
			}
			// Update the display of the hosts in the leaderboard
			updateHostsInLeaderboard();
			updateContextMenuHandling();
			break;
		case "host_promotion":
			host = true;
			if (onQuizPage)
			{
				document.querySelector(`#suggestQuizButton`).remove();
				addChangeQuizButton();
			}
			urls = message["urls"];
			updateHostsInLeaderboard();
			updateLeaderboardUrls();
			updateContextMenuHandling();
			addSaveRoomButton();
			if (message["poll_data"] !== null)
			{
				addCreatePollBox(message["poll_data"]);
			}
			else
			{
				addCreatePollButton();
			}
			break;
		case "start_countdown":
			// Start the countdown
			startCountdown();
			break;
		case "start_quiz":
			// Start the quiz!

			if (!quizRunning)
			{
				// First remove the quiz start provention
				setQuizStartProvention(false);
				document.querySelector(`#button-play`).click();
			}
			break;
		case "live_scores_update":
			updateLiveScores(message["live_scores"]);
			break;
		case "change_quiz":
			newUrl = message["url"];
			currentUrl = window.location.href;
			if (currentUrl !== newUrl)
			{
				window.location = newUrl;
			}
			break;
		case "suggest_quiz":
			// Won't be a duplicate as these are caught in the background script.
			delete message["type"];
			
			suggestions.push(message);
			updateSuggestionList(message);
			break;
		case "url_update":
			urls[message["username"]] = message["url"]
			updateLeaderboardUrls()
			break;
		case "poll_create":
			if (document.querySelector("#pollBox") === null)
			{
				addCreatePollBox(message["poll_data"]);
			}
			break;
		case "poll_data_update":
			updateCreatePollBox(message["poll_data"]);
			break;
		case "poll_start":
			document.querySelector("#pollBox")?.remove();
			addVoteInfoBox(message["vote_data"]);
			addBallotPopout(message["vote_data"].poll);
			break;
		case "vote_update":
			updateVoteInfoBox(message["vote_data"]);
			break;
	}

}

function updateHostsInLeaderboard()
{
	document.querySelectorAll(`#leaderboard > li`).forEach(
		(row) =>
		{
			const name = row.firstChild.textContent;
			row.firstChild.nextElementSibling.textContent = (hosts.includes(name)) ? "host" : "";
		}
	);
}
async function createRoom(event)
{
	event.preventDefault();
	const form = event.target;

	username = form.querySelector(`input[type="text"]`).value.trim();
	const button = form.querySelector(`input[type="submit"]`);
	button.disabled = true;
	button.value = "...";

	const message = {
		type: "create_room",
		username: username,
	}
	try
	{
		port.postMessage({type: "startConnection", initialMessage: message});

		await new Promise((resolve, reject) => {
			let connectListener;
			port.onMessage.addListener(
				connectListener = (message) =>
				{
					port.onMessage.removeListener(connectListener);
					if (message.type === "create_room")
					{
						host = true;
						hosts = [username];
						roomCode = message["room_code"];

						port.postMessage({type: "url_update", url: window.location.pathname});

						// Set up message handing
						port.onMessage.addListener(processMessage);

						resolve();
					}
					else
					{
						reject(message);
					}
				}
			);
		});
	}
	catch (error)
	{
		console.error(error);
		return;
	}

	try
	{
		await navigator.clipboard.writeText(`https://sporcle.com/#xporcle:${roomCode}`);
	}
	catch (error)
	{
		console.error("Clipboard write failure: ", error);
	}

	/* clipboard-write permissions query is only available in chrome
	await navigator.permissions.query({name: "clipboard-write"}).then(
		(result) =>
		{
			if (result.state == "granted" || result.state == "prompt")
			{
				// Copy roomCode to clipboard
				navigator.clipboard.writeText(roomCode).then((success) => true, (failure) => false);
			}
		}
	);
	*/

	interfaceBox.querySelectorAll(`form`).forEach(
		(form) => form.remove()
	);

	onRoomConnect();
}

async function joinRoom(event)
{
	event.preventDefault();
	const form = event.target.parentNode;

	username = form.querySelector(`#joinRoomUsernameInput`).value.trim();
	roomCode = form.querySelector(`#joinRoomCodeInput`).value.trim();

	const button = form.querySelector(`input[type="submit"]`);
	button.disabled = true;
	button.value = "...";

	const message = {
		type: "join_room",
		username: username,
		code: roomCode,
	};

	try
	{
		port.postMessage({type: "startConnection", initialMessage: message});

		let connectListener;
		await new Promise((resolve, reject) => {
			port.onMessage.addListener(
				connectListener = (message) =>
				{
					port.onMessage.removeListener(connectListener);
					if (message.type === "join_room")
					{
						if (message.success)
						{
							hosts = message["hosts"];
							port.postMessage({type: "url_update", url: window.location.pathname})

							// Set up message handing
							port.onMessage.addListener(processMessage);

							resolve();
						}
						else
						{
							reject(message.fail_reason);
						}
					}
					else
					{
						reject(message);
					}
				}
			);
		});
	}
	catch (error)
	{
		const errorMessageBox = document.createElement("div");
		errorMessageBox.classList.add("errorMessage");
		errorMessageBox.textContent = error;
		errorMessageBox.style = 
		`
			color: red;
			background-Color: #f7e6e6;
			outline: 1px solid pink;
		`;
		window.setTimeout(() => {errorMessageBox.remove();}, 5000);

		resetInterface(errorMessageBox,
			(error !== "username taken") ? username : undefined,
			(error !== "invalid code") ? roomCode : undefined
		);
		return;
	}

	onRoomConnect();
}

async function loadRoom(event, form)
{
	event.preventDefault();

	saveName = form.querySelector(`#saveSelect`).value;

	const button = form.querySelector(`input[type="submit"]`);
	button.disabled = true;
	button.value = "...";

	saveData = await new Promise(
		(resolve, reject) =>
		{
			chrome.storage.sync.get("saves", data => resolve(data.saves[saveName]));
		}
	);

	username = saveData.me;

	const message = {
		type: "load_room",
		username: username,
		url: window.location.pathname,
		saveName: saveName,
		save_data: {
			scores: saveData.scores
		}
	};

	try
	{
		port.postMessage({type: "startConnection", initialMessage: message});

		let connectListener;
		await new Promise((resolve, reject) => {
			port.onMessage.addListener(
				connectListener = (message) =>
				{
					port.onMessage.removeListener(connectListener);
					if (message.type === "load_room")
					{
						host = true;
						hosts = [username];
						roomCode = message["room_code"];

						// Set up message handing
						port.onMessage.addListener(processMessage);

						resolve();
					}
					else
					{
						reject(message);
					}
				}
			);
		});
	}
	catch (error)
	{
		const errorMessageBox = document.createElement("div");
		errorMessageBox.classList.add("errorMessage");
		errorMessageBox.textContent = error;
		errorMessageBox.style = 
		`
			color: red;
			background-Color: #f7e6e6;
			outline: 1px solid pink;
		`;
		window.setTimeout(() => {errorMessageBox.remove();}, 5000);

		resetInterface(errorMessageBox);
		return;
	}

	saveData = null;

	try
	{
		await navigator.clipboard.writeText(`https://sporcle.com/#xporcle:${roomCode}`);
	}
	catch (error)
	{
		console.error("Clipboard write failure: ", error);
	}

	onRoomConnect();
}
function onRoomConnect(existingScores, existingPollData, currentVoteData)
{
	// Set up message handing if not done already.
	if (!port.onMessage.hasListener(processMessage))
	{
		port.onMessage.addListener(processMessage);
	}

	// Clear the interface box of the forms
	interfaceBox.querySelectorAll(`form`).forEach(
		(form) => form.remove()
	);

	// Display the room code
	const roomCodeHeader = document.createElement("h4");
	roomCodeHeader.id = "roomCodeHeader";
	roomCodeHeader.style.margin = "0";
	roomCodeHeader.textContent = "Room code: ";
	roomCodeHeader.appendChild(document.createElement("span"));
	roomCodeHeader.lastChild.textContent = roomCode;
	if (options.blurRoomCode)
	{
		roomCodeHeader.lastChild.style.filter = "blur(0.4em)";
	}
	interfaceBox.insertBefore(roomCodeHeader, interfaceBox.firstElementChild);

	// If the user is a host and is on a quiz,
	// add a button to send the quiz to the rest of the room
	if (host && onQuizPage)
	{
		addChangeQuizButton();
	}
	else if (!host && onQuizPage)
	{
		addSuggestionQuizButton();
	}

	// Make the leaderboard
	let scores;
	if (existingScores !== undefined)
	{
		scores = existingScores;
	}
	else
	{
		scores = {};
		scores[username] = {score: 0, wins: 0};
	}

	addLeaderboard(scores);

	// Add a button to leave the room
	interfaceBox.appendChild(document.createElement("button"));
	interfaceBox.lastChild.textContent = "Leave Room";
	interfaceBox.lastChild.addEventListener("click",
		(event) => {
			port.postMessage({type: "leave_room"});
		}
	);

	// Add a buttons for host only features
	if (host)
	{
		addSaveRoomButton();
		if (existingPollData)
		{
			addCreatePollBox(existingPollData);
		}
		else
		{
			addCreatePollButton();
		}
	}

	// Add vote info for current poll
	if (currentVoteData !== undefined)
	{
		addVoteInfoBox(currentVoteData);
		if (!voted && !currentVoteData["finished"])
		{
			addBallotPopout(currentVoteData.poll);
		}
	}

	// If on a quiz page, observe for the start of the quiz
	if (onQuizPage)
	{
		if (host)
		{
			// Add new button covering start button which will start the count down;
			const playButton = document.querySelector("#button-play");

			const buttonContainer = document.createElement("div");
			buttonContainer.style =
			`
				height: 0;
				overflow: visible;
			`;
			const startCountdownButton = playButton.cloneNode(true);
			startCountdownButton.id = "startCountdown";
			startCountdownButton.style =
			`
				position: absolute;
				transform: translateY(-100%);
				background-color: green;
			`;
			startCountdownButton.firstChild.style["background"] = "unset";
			startCountdownButton.addEventListener("click",
				(event) =>
				{
					event.stopPropagation();
					event.preventDefault();
					startCountdown(true);
					startCountdownButton.remove();
					setTimeout(() => playButton.click(), 3000);
				}, true
			);

			buttonContainer.appendChild(startCountdownButton);
			playButton.parentNode.appendChild(buttonContainer);

		}
		else
		{
			// If not a host and on a quiz, stop the user from starting any quizzes
			setQuizStartProvention(true);
		}

		const startButtons = document.querySelector(`#playPadding`);
		quizStartObserver.observe(startButtons, {attributes: true});
		quizStartObserver.observe(startButtons.parentNode, {childList: true}); // Crossword style start button.
	}

	if (host)
	{
		updateLeaderboardUrls();
		updateSuggestionList();
	}
}

function addSaveRoomButton()
{
	const saveButton = document.createElement("button");
	saveButton.id = "saveButton";
	saveButton.textContent = "Save Room";
	saveButton.addEventListener("click", saveRoom);
	interfaceBox.appendChild(saveButton);
}

function addChangeQuizButton()
{
	const changeQuizButton = document.createElement("button");
	changeQuizButton.id = "changeQuizButton";
	changeQuizButton.textContent = "Send Quiz to Room";
	changeQuizButton.addEventListener("click",
		(event) =>
		{
			port.postMessage(
				{
					type: "change_quiz",
					url: window.location.href
				}
			);
		}
	);

	// The button goes just after the room code header
	interfaceBox.insertBefore(changeQuizButton, interfaceBox.querySelector(`#roomCodeHeader`).nextElementSibling);
}

function addSuggestionQuizButton()
{
	const shortTitle = document.querySelector(`title`).textContent;
	const longTitle = document.querySelector("#gameMeta>h2").textContent;

	const suggestQuizButton = document.createElement("button");
	suggestQuizButton.id = "suggestQuizButton";
	suggestQuizButton.textContent = "Suggest Quiz to Hosts";
	suggestQuizButton.addEventListener("click",
		(event) =>
		{
			port.postMessage(
				{
					type: "suggest_quiz",
					url: window.location.href,
					short_title: shortTitle,
					long_title: longTitle
				}
			);
		}
	);
	// The button goes just after the room code header, where the changeQuizButton would be for hosts
	interfaceBox.insertBefore(suggestQuizButton, interfaceBox.querySelector(`#roomCodeHeader`).nextElementSibling);
}

function addCreatePollButton()
{
	const createPollButton = document.createElement("button");
	createPollButton.id = "createPollButton";
	createPollButton.textContent = "Create Poll for Next Quiz";
	createPollButton.addEventListener("click",
		(event) =>
		{
			const pollData = {duration: 30, entries: []};
			addCreatePollBox(pollData);
			port.postMessage({type: "poll_create", poll_data: pollData});
			createPollButton.remove();
		}
	);

	interfaceBox.append(createPollButton);
}

function addCreatePollBox(pollData)
{
	const pollBox = document.createElement("div");
	pollBox.id = "pollBox";
	pollBox.style =
	`
		width: calc(((100vw - 960px) / 2 - 10px));
		padding: 0.5em;
		box-sizing: border-box;
		max-width: 400px;
		list-style: none;
		border-width: 1px;
		border-style: solid;
		border-color: darkgrey;
		border-radius: 0.25em;
		background-color: white;

		display: grid;
		row-gap: 1em;
		grid-template-columns: 100%;
	`;
	
	const header = document.createElement("h2");
	header.textContent = "Next Quiz Poll";
	pollBox.append(header);

	if (onQuizPage)
	{
		// Get info about quiz from page
		const currentQuiz =
		{
			url: window.location.href,
			short_title: document.querySelector(`title`).textContent,
			long_title: document.querySelector("#gameMeta>h2").textContent
		};

		const addCurrentQuizToPollButton = document.createElement("button");
		addCurrentQuizToPollButton.textContent = "Add Quiz to Poll";
		addCurrentQuizToPollButton.id = "addCurrentQuizToPoll";
		addCurrentQuizToPollButton.addEventListener("click",
			(event) =>
			{
				if (!pollData.entries.some(existingQuiz => existingQuiz.url === currentQuiz.url))
				{
					pollData.entries.push(currentQuiz);
					const newEntryListItem = document.createElement("li");
					newEntryListItem.style =
					`
						display: grid;
						grid-template-columns: 1fr 1em;
						align-items: center;
					`;

					newEntryListItem.id = currentQuiz.short_title;
					newEntryListItem.textContent = currentQuiz.short_title;
					removeEntryButton = document.createElement("div");
					removeEntryButton.style =
					`
						background-color: red;
						color: white;
						border-radius: 50%;
						display: flex;
						justify-content: center;
						align-content: center;
						cursor: pointer;
						height: 1em;
						width: 1em;
						line:height: 1em;
					`;
					removeEntryButton.textContent = "×";
					removeEntryButton.addEventListener("click",
						(event) =>
						{
							newEntryListItem.remove();
							pollData.entries = pollData.entries.filter(existingEntry => existingEntry.url !== currentQuiz.url);
							port.postMessage({type:"poll_data_update", poll_data: pollData});
						}
					);
					newEntryListItem.append(removeEntryButton);

					pollBox.querySelector("#pollEntriesList").append(newEntryListItem);

					// Send updated data
					port.postMessage({type:"poll_data_update", poll_data: pollData});
				}
			}
		);
		pollBox.append(addCurrentQuizToPollButton);
	}
	
	const pollEntriesList = document.createElement("ol");
	pollEntriesList.style =
	`
		padding: 0;
	`;
	pollEntriesList.id = "pollEntriesList";
	for (const entry of pollData.entries)
	{
		const entryListItem = document.createElement("li");
		entryListItem.style =
		`
			display: grid;
			grid-template-columns: 1fr 1em;
		    align-items: center;
		`;
		entryListItem.id = entry.short_title;
		entryListItem.textContent = entry.short_title;
		removeEntryButton = document.createElement("div");
		removeEntryButton.style =
		`
			background-color: red;
			color: white;
			border-radius: 50%;
			display: flex;
			justify-content: center;
			align-content: center;
			cursor: pointer;
			height: 1em;
			width: 1em;
			line-height: 1em;
		`;
		removeEntryButton.textContent = "×";
		removeEntryButton.addEventListener("click",
			(event) =>
			{
				entryListItem.remove();
				pollData.entries = pollData.entries.filter(existingEntry => existingEntry.url !== entry.url);
				port.postMessage({type:"poll_data_update", poll_data: pollData});
			}
		);
		entryListItem.append(removeEntryButton);
		pollEntriesList.append(entryListItem);
	}
	pollBox.append(pollEntriesList);

	const pollDurationInput = document.createElement("input");
	pollDurationInput.id = "pollDuration";
	pollDurationInput.type = "number";
	pollDurationInput.min = "10";
	pollDurationInput.max = "60";
	pollDurationInput.value = pollData.duration;
	pollDurationInput.addEventListener("change",
		(event) =>
		{
			pollData.duration = Math.max(10, Math.min(pollDurationInput.value, 60));
			// Send updated data
			port.postMessage({type:"poll_data_update", poll_data: pollData});
		}
	);
	pollDurationInput.addEventListener("blur",
		(event) =>
		{
			pollDurationInput.value = pollData.duration;
		}
	);
	const pollDurationContainer = document.createElement("div");
	pollDurationContainer.append(
		document.createTextNode("Poll Time:"),
		pollDurationInput,
		document.createTextNode("s")
	);
	pollBox.append(pollDurationContainer);

	if (pollData.entries.length > 1)
	{
		const sendPollToRoomButton = document.createElement("Button");
		sendPollToRoomButton.textContent = "Send Poll to Room";
		sendPollToRoomButton.id = "sendPollToRoom";
		sendPollToRoomButton.addEventListener("click",
			(event) =>
			{
				// Send poll to server
				port.postMessage(
					{
						type:"poll_start",
						start_time: (new Date()).getTime()
					}
				);
				pollBox.remove();
			}
		);
		pollBox.append(sendPollToRoomButton);
	}

	interfaceContainer.insertBefore(pollBox, interfaceBox.nextElementSibling);
}

function updateCreatePollBox(pollData)
{
	const pollBox = document.querySelector("#pollBox");
	// Clear entires
	pollBox.querySelectorAll("ol li").forEach(entry => entry.remove());
	// Add updated entries
	for (const entry of pollData.entries)
	{
		const entryListItem = document.createElement("li");
		entryListItem.style =
		`
			display: grid;
			grid-template-columns: 1fr 1em;
		    align-items: center;
		`;
		entryListItem.id = entry.short_title;
		entryListItem.textContent = entry.short_title;
		removeEntryButton = document.createElement("div");
		removeEntryButton.style =
		`
			background-color: red;
			color: white;
			border-radius: 50%;
			display: flex;
			justify-content: center;
			align-content: center;
			cursor: pointer;
			height: 1em;
			width: 1em;
			line-height: 1em;
		`;
		removeEntryButton.textContent = "×";
		removeEntryButton.addEventListener("click",
			(event) =>
			{
				entryListItem.remove();
				pollData.entries = pollData.entries.filter(existingEntry => existingEntry.url !== entry.url);
				port.postMessage({type:"poll_data_update", poll_data: pollData});
			}
		);
		entryListItem.append(removeEntryButton);
		pollBox.querySelector("ol").append(entryListItem);
	}

	// Update duration
	pollBox.querySelector("#pollDuration").value = pollData.duration;

	// Update start button display
	let sendPollToRoomButton = document.querySelector("#sendPollToRoom");
	if (pollData.entries.length > 1)
	{
		if (sendPollToRoomButton === null)
		{
			sendPollToRoomButton = document.createElement("Button");
			sendPollToRoomButton.textContent = "Send Poll to Room";
			sendPollToRoomButton.id = "sendPollToRoom";
			sendPollToRoomButton.addEventListener("click",
				(event) =>
				{
					// Send poll to server
					port.postMessage(
						{
							type:"poll_start",
							poll_data: pollData,
							start_time: (new Date()).getTime()
						}
					);
					pollBox.remove();
				}
			);
			pollBox.append(sendPollToRoomButton);
		}
	}
	else
	{
		sendPollToRoomButton?.remove();
	}

}

function addVoteInfoBox(voteData)
{
	document.querySelector("#voteInfoBox")?.remove()
	const voteInfoBox = document.createElement("div");
	voteInfoBox.id = "voteInfoBox";
	voteInfoBox.style = 
	`
		width: calc(((100vw - 960px) / 2) - 10px);
		padding: 0.5em;
		box-sizing: border-box;
		max-width: 400px;
		list-style: none;
		border-width: 1px;
		border-style: solid;
		border-color: darkgrey;
		border-radius: 0.25em;
		background-color: white;
		display: grid;
		row-gap: 1em;
		grid-template-columns: 100%;
	`;

	const header = document.createElement("h2");
	header.textContent = "Vote Status";
	voteInfoBox.append(header);

	const timer = document.createElement("p");
	timer.append(document.createTextNode("Time left: "));
	const timeLeft = document.createElement("span");
	timeLeft.id = "timeLeft";
	if (!voteData["finished"])
	{
		timeLeft.textContent = Math.floor((voteData.start_time + voteData.duration*1000 - (new Date()).getTime())/1000);
		const intervalId = setInterval(
			() =>
			{
				if (timeLeft.textContent !== "Finished")
				{
					timeLeft.textContent = ((voteData.start_time + voteData.duration*1000 - (new Date()).getTime())/1000).toFixed(1);
				}
				else
				{
					clearInterval(intervalId);
				}
			},
			100
		);
		setTimeout(
			() =>
			{
				clearInterval(intervalId);
				timeLeft.textContent = "Finished";
			},
			voteData.duration*1000
		);
	}
	else
	{
		timeLeft.textContent = "Finished";
	}
	timer.append(timeLeft);
	voteInfoBox.append(timer);

	const responses = document.createElement("p");
	const responseCount = document.createElement("span");
	responseCount.id = "responseCount";
	responses.append(responseCount);
	responses.append(document.createTextNode(" responded"));
	voteInfoBox.append(responses);

	if (!voteData.finished)
	{
		const openBallotButton = document.createElement("button");
		openBallotButton.id = "openBallotButton";
		openBallotButton.textContent = "Open Vote Box";
		openBallotButton.addEventListener("click", () => {addBallotPopout(voteData.poll)})
		voteInfoBox.append(openBallotButton);
	}

	interfaceContainer.append(voteInfoBox);

	updateVoteInfoBox(voteData);
}

function updateVoteInfoBox(voteData)
{
	let voteInfoBox = document.querySelector("#voteInfoBox");
	if (voteInfoBox === null)
	{
		return addVoteInfoBox(voteData);
	}

	document.querySelector("#responseCount").textContent = `${voteData.response_count}/${voteData.num_voters}`;
	if (voteData.finished)
	{
		const winnerHeader = document.createElement("h3");
		winnerHeader.textContent = "Winner:";
		voteInfoBox.append(winnerHeader);
		const winnerLink = document.createElement("a");
		winnerLink.href = voteData.winner.url;
		winnerLink.textContent = voteData.winner.short_title;
		voteInfoBox.append(winnerLink);

		voteInfoBox.querySelector("#timeLeft").textContent = "Finished";

		voteInfoBox.querySelector("#openBallotButton")?.remove();
	}
}

function addBallotPopout(poll)
{
	document.querySelector("#ballotPopout")?.remove();
	const ballotPopout = document.createElement("div");
	ballotPopout.id = "ballotPopout";
	ballotPopout.style =
	`
		position: fixed;
		background: white;
		left: 50%;
		top: 50%;
		transform: translate(-50%,-50%);
		width: 40vw;
		min-height: 40vw;
		z-index: 999999;
		border-radius: 0.5em;
		border: 1px solid #888;
		display: grid;
		row-gap: 1em;
		grid-template-columns: 100%;
		padding: 0.5em;
	`;

	const closeBoxButton = document.createElement("button");
	closeBoxButton.textContent = "×";
	closeBoxButton.style =
	`
		appearance: none;
		padding: 0;
		border: 0;
		position: absolute;
		right: 1rem;
		top: 1rem;
		color: grey;
		cursor: pointer;
		background: none;
		font-size: 150%;
	`;
	closeBoxButton.addEventListener("click",
		(event) =>
		{
			ballotPopout.remove();
		}
	);
	ballotPopout.append(closeBoxButton);

	const header = document.createElement("h1");
	header.textContent = "Next Quiz Poll";
	ballotPopout.append(header);

	const timer = document.createElement("p");
	timer.append(document.createTextNode("Time left: "));
	const timeLeft = document.createElement("span");
	timeLeft.id = "timeLeft";
	timeLeft.textContent = Math.floor((poll.start_time + poll.duration*1000 - (new Date()).getTime())/1000);
	const intervalId = setInterval(
		() =>
		{
			timeLeft.textContent = ((poll.start_time + poll.duration*1000 - (new Date()).getTime())/1000).toFixed(1);
		},
		100
	);
	setTimeout(
		() =>
		{
			clearInterval(intervalId);
			timeLeft.textContent = "Finished";
			// disable all checkboxes and submit button
			Array.from(ballotPopout.querySelectorAll(`input[type="checkbox"], #submitBallot`)).forEach(elem => elem.disabled = true);
			setTimeout(()=>ballotPopout.remove(), 2000);
		},
		poll.duration*1000
	);
	timer.append(timeLeft);
	ballotPopout.append(timer);

	const entriesList = document.createElement("ol");
	entriesList.style = 
	`
		padding: 0;
	`;
	for (const entry of poll.entries)
	{
		const entryListItem = document.createElement("li");
		entryListItem.textContent = entry.long_title;
		entryListItem.style =
		`
			display: grid;
			grid-template-columns: 1fr 1em;
		    align-items: center;
		`;

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		entryListItem.append(checkbox)
		entriesList.append(entryListItem);
	}
	ballotPopout.append(entriesList);

	const submitButton = document.createElement("button");
	submitButton.textContent = "Submit";
	submitButton.id = "submitBallot";
	submitButton.addEventListener("click",
		(event) =>
		{
			const votes = Array.from(ballotPopout.querySelectorAll(`input[type="checkbox"]`)).map(checkbox => Number(checkbox.checked));
			port.postMessage({type: "poll_vote", votes: votes});
			ballotPopout.remove();
			document.querySelector("#openBallotButton")?.remove();
		}
	);
	ballotPopout.append(submitButton);

	document.body.insertBefore(ballotPopout, document.body.firstElementChild);
}

async function saveRoom(event)
{
	const saveDataRecieved = new Promise(
		(resolve, reject) =>
		{
			confirmSaveDataRecieved = resolve;
			setTimeout(reject, 5000); // Reject if data hasn't been recieved in 5 seconds.
		}
	)
	port.postMessage({type: "save_room"});
	
	try
	{
		savesObject = await new Promise(
			(resolve, reject) =>
			{
				chrome.storage.sync.get("saves",
					(data) =>
					{
						if (Object.keys(data).length === 0)
						{
							resolve({});
						}
						else
						{
							resolve(data["saves"]);
						}
					}
				);
			}
		);
		await saveDataRecieved;
		// Data has been recieved and stored in saveData.
		// Check if we have a previously set up a name for this save.
		
		if (saveName === null)
		{
			// No save name already specified,
			// we need to ask the user for this before we can store the save.

			const otherSaveNames = Object.keys(savesObject);

			const defaultName = `Room from ${(new Date()).toLocaleDateString()}`;

			saveName = prompt(
				`Enter a name for this new save.${(otherSaveNames.length !== 0) ? "\nExisting save names:\n" + otherSaveNames.join("\n") : ""}`,
				defaultName
			);
			
			if (
				saveName === null // Canceled save prompt
				||
				(
					otherSaveNames.includes(saveName) // saveName already exists
					&& !confirm(`Replace existing save - ${saveName}`) // Canceled replace confirmation
				)
			)
			{
				throw "canceled";
			}

			if (saveName === "")
			{
				// If an empty string is given as the name, just revert to the default
				saveName = defaultName;
			}
		}

		// Send the saveName to the background script, so it can be given back to us after page changes
		port.postMessage({type: "saveName", saveName: saveName});

		// Put the save data in the saves object
		savesObject[saveName] = saveData;

		// Store the updated savesObject
		chrome.storage.sync.set({saves: savesObject});
	}
	catch (error)
	{
		// Something went wrong.

		// clear the saveData and the data recieved confirmation function
		saveData = null;
		confirmSaveDataRecieved = null;

		if (error === "timed out")
		{
			// Data not been recieved in time.
		}
		else if (error === "canceled")
		{
			// Saving operation was canceled at some point.
			// This was in one of the naming operations, so let's clear the saveName
			saveName = null;
		}
	}
}

function updateLeaderboard(scores)
{
	const scoresCopy = JSON.parse(JSON.stringify(scores));
	let leaderboard = interfaceBox.querySelector(`#leaderboard`);
	if (leaderboard === null)
	{
		addLeaderboard(scores);
		return null;
	}

	const rows = leaderboard.querySelectorAll(`li`);
	rows.forEach(
		(row) => {
			const nameElem = row.firstChild;
			const winsElem = row.lastChild.previousElementSibling;
			const pointsElem = row.lastChild;
			if (scores[nameElem.textContent] !== undefined)
			{
				winsElem.textContent = scores[nameElem.textContent]["wins"];
				pointsElem.textContent = scores[nameElem.textContent]["score"];
				delete scores[nameElem.textContent];
			}
			else
			{
				row.remove();
			}
		}
	);

	for (const [name, {score, wins}] of Object.entries(scores))
	{
		const row = rows[0].cloneNode(true);
		row.firstChild.textContent = name;
		row.firstChild.nextElementSibling.textContent = (hosts.includes(name)) ? "host" : "";
		row.lastChild.previousElementSibling.textContent = wins;
		row.lastChild.textContent = score;

		leaderboard.appendChild(row);
	}


	// Now sort the by score, falling back to alphabetically
	// First restart scores back to it's unmodified state
	scores = scoresCopy;
	
	const sortedRows = Array.from(leaderboard.querySelectorAll('li'));

	const alphabetically = (a, b) =>
	{
		if (a.firstChild.textContent.toLowerCase() < b.firstChild.textContent.toLowerCase())
			return -1;
		else
			return 1;
	};
	const byWins = (a, b) =>
	{
		const aName = a.firstChild.textContent;
		const bName = b.firstChild.textContent;
		const aWins = scores[aName]["wins"];
		const bWins = scores[bName]["wins"];

		if (aWins < bWins)
			return 1;
		else if (aWins > bWins)
			return -1;
		else
			return 0;
	}

	const byScore = (a, b) =>
	{
		const aName = a.firstChild.textContent;
		const bName = b.firstChild.textContent;
		const aScore = scores[aName]["score"];
		const bScore = scores[bName]["score"];

		if (aScore < bScore)
			return 1;
		else if (aScore > bScore)
			return -1;
		else
			return 0;
	};

	sortedRows.sort(alphabetically);
	sortedRows.sort(byScore);

	sortedRows.forEach(
		(row) =>
		{
			leaderboard.appendChild(row);
		}
	);

	updateContextMenuHandling();
}

function updateContextMenuHandling()
{
	document.querySelectorAll(`#leaderboard > li`).forEach(
		(row) =>
		{
			if (host && !hosts.includes(row.firstChild.textContent))
			{
				row.addEventListener("contextmenu", cmEventHandle);
				row.style.cursor = "context-menu";
			}
			else
			{
				row.removeEventListener("contextmenu", cmEventHandle);
				row.style.cursor = "default";
			}
		}
	);
}

function updateLeaderboardUrls()
{
	const leaderboard = interfaceBox.querySelector(`#leaderboard`);
	if (leaderboard === null)
	{
		return;
	}

	const rows = leaderboard.querySelectorAll(`li`);
	rows.forEach(
		(row) =>
		{
			const name = row.firstChild.textContent;
			if (name !== username && (name in urls) && urls[name] !== window.location.pathname)
			{
				row.style.backgroundColor = "LightGrey";
			}
			else
			{
				row.style.backgroundColor = "unset";
			}
		}
	);

	if (onQuizPage)
	{
		const allPlayersOnSamePage = ! Object.entries(urls).some(entry => entry[1] !== window.location.pathname);

		setQuizStartProvention(allPlayersOnSamePage === false)
	}
}

function updateSuggestionList(newSuggestion)
{
	let suggestionsList = document.querySelector(`#suggestionsList`);
	if (suggestionsList === null)
	{
		addSuggestionsList();
	}
	else
	{
		const row = suggestionsList.firstChild.cloneNode(true);
		row.title = newSuggestion["long_title"];
		row.textContent = `${newSuggestion["username"]}: ${newSuggestion["short_title"]}`;
		row.addEventListener("click",
			(event) =>
			{
				suggestions = suggestions.filter(item => item !== newSuggestion);
				port.postMessage({type:"removeSuggestion", ...newSuggestion});
				window.location = newSuggestion["url"];
			}
		);
		suggestionsList.insertBefore(row, suggestionsList.lastChild);
	}
}

function clearSuggestionList()
{
	const suggestionsList = document.querySelector("#suggestionsList");
	suggestionsList.remove();
	const suggestionsHeader = document.querySelector("#suggestionsHeader");
	suggestionsHeader.remove();
	
	suggestions.forEach(
		(suggestion) =>
		{
			port.postMessage({type: "removeSuggestion", ...suggestion});
		}
	);

	suggestions.length = 0;
}

function setQuizStartProvention(prevent)
{
	const playPadding = document.querySelector(`#playPadding`);
	if (document.querySelector(`#button-play`) === null)
	{
		// No play button so no need to stop it being clicked, we have probably finished a quiz now.
		return false;
	}

	if (prevent)
	{
		playPadding.addEventListener("click", stopQuizStart, true);
	}
	else
	{
		playPadding.removeEventListener("click", stopQuizStart, true);
	}

}

function stopQuizStart(event)
{
	event.stopPropagation();
	event.preventDefault();
}

function startCountdown(send = false)
{
	const countdownContainer = document.createElement("div");
	countdownContainer.id = "countdownContainer";
	countdownContainer.style =
	`
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(255,255,255,0.3);
		z-index: 9999;
		display: flex;
		justify-content: center;
		align-items: center;
	`;
	
	const countElement = document.createElement("span");
	countElement.style =
	`
		font-size: 20vw;
	`;

	let count = 3;
	countElement.textContent = count--;
	countdownContainer.appendChild(countElement);
	document.body.appendChild(countdownContainer);
	
	if (send)
	{
		port.postMessage({type: "start_countdown"});
	}
	const countdownInterval = setInterval(
		() =>
		{
			if (count === 0)
			{
				clearInterval(countdownInterval);
				countdownContainer.remove();	
			}
			else
			{
				countElement.textContent = count--;
			}
		}, 1000);
}

function updateLiveScores(scores)
{
	let liveScores = interfaceBox.querySelector(`#liveScores`);
	if (liveScores === null)
		liveScores = addLiveScores(scores);

	const rows = liveScores.querySelectorAll(`li`);
	rows.forEach(
		(row) =>
		{
			const nameElem = row.firstChild;
			const pointsElem = row.lastChild;
			if (scores[nameElem.textContent] !== undefined)
			{
				pointsElem.textContent = scores[nameElem.textContent]["score"];
				if (scores[nameElem.textContent]["finished"])
				{
					// This player has finished the quiz
					row.style.backgroundColor = "LightGreen";
				}
				else
				{
					row.style.backgroundColor = "unset";
				}
			}
			else
			{
				row.remove();
			}
		}
	);

	/* Probaly won't have extra people in the live scores once the quiz has started
	for (const [name, data] of Object.entries(scores))
	{
		const row = rows[0].cloneNode(true);
		row.firstChild.textContent = name;
		row.lastChild.textContent = data["score"];
		liveScores.appendChild(row);
	}
	*/

	// Now sort them into order, by score, then by time to break ties, then alphabetically if still tied
	let sortedRows = Array.from(rows);

	const alphabetically = (a, b) =>
	{
		if (a.firstChild.textContent.toLowerCase() < b.firstChild.textContent.toLowerCase())
			return -1;
		else
			return 1;
	};

	const byTime = (a, b) =>
	{
		const aName = a.firstChild.textContent;
		const bName = b.firstChild.textContent;
		const aTime = scores[aName]["quiz_time"];
		const bTime = scores[bName]["quiz_time"];

		if (aTime < bTime)
			return -1;
		else if (aTime > bTime)
			return 1;
		else
			return 0; // Highly unlikely
	};

	const byScore = (a, b) =>
	{
		const aName = a.firstChild.textContent;
		const bName = b.firstChild.textContent;
		const aScore = scores[aName]["score"];
		const bScore = scores[bName]["score"];

		if (aScore < bScore)
			return 1;
		else if (aScore > bScore)
			return -1;
		else
			return 0;
	};


	sortedRows.sort(alphabetically);
	sortedRows.sort(byTime);
	sortedRows.sort(byScore);

	sortedRows.forEach(
		(row) =>
		{
			liveScores.appendChild(row);
		}
	);
}

function addLeaderboard(scores)
{
	let leaderboard = interfaceBox.querySelector(`#leaderboard`);
	if (leaderboard !== null)
		return false;

	leaderboard = document.createElement("ol");
	leaderboard.id = "leaderboard";
	leaderboard.style =
	`
		width: 100%;
		padding: 0;
		margin: auto;
	`;

	const columnHeaders = document.createElement("h3");
	columnHeaders.style =
	`
		margin: 0 0 1em 0;
		display: grid;
		grid-template-columns: 3fr 1fr 1fr;
	`;
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Name";
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Wins";
	columnHeaders.lastChild.style = `text-align: right;`;
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Points";
	columnHeaders.lastChild.style = `text-align: right;`;

	leaderboard.appendChild(columnHeaders);

	for (const [name, {score, wins}] of Object.entries(scores))
	{
		const row = document.createElement("li");
		row.style =
		`
			display: grid;
			grid-template-columns: fit-content(calc(60% - 3em)) 1fr 20% 20%;
			cusor: default;
		`;

		// Username
		const usernameContainer = document.createElement("span");
		usernameContainer.textContent = name;
		usernameContainer.style =
		`
			overflow-wrap: anywhere;
		`;
		row.appendChild(usernameContainer);

		// Host
		row.appendChild(document.createElement("span"));
		row.lastChild.textContent = (hosts.includes(name)) ? "host" : "";
		row.lastChild.style =
		`
			font-size: 80%;
			font-style: oblique;
			padding-left: 0.5em;
			align-self: end;
		`;

		// Wins
		const winsContainer = document.createElement("span");
		winsContainer.textContent = wins;
		winsContainer.style =
		`
			text-align: right;
		`;
		row.appendChild(winsContainer);

		// Points
		const pointsContainer = row.lastChild.cloneNode(true);
		pointsContainer.textContent = score;
		row.appendChild(pointsContainer);
		
		leaderboard.appendChild(row);
	}


	const leaderboardHeader = document.createElement("h2");
	leaderboardHeader.id = "leaderboardHeader";
	leaderboardHeader.style.margin = "0";
	leaderboardHeader.textContent = "Overall Rankings";
	interfaceBox.appendChild(leaderboardHeader);

	interfaceBox.appendChild(leaderboard);
	updateContextMenuHandling();

	return leaderboard;
}

function cmEventHandle(event)
{
	event.preventDefault();
	displayContextMenu(event);
}

function addLiveScores(scores)
{
	const liveScores = document.createElement("ol");
	liveScores.id = "liveScores";
	liveScores.style =
	`
		width: 100%;
		max-width: 10em;
		padding: 0;
		margin: auto;
	`;

	const columnHeaders = document.createElement("h3");
	columnHeaders.style =
	`
		margin: 0 0 1em 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
	`;

	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Name";
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Points";
	columnHeaders.lastChild.style = `text-align: right;`;

	liveScores.appendChild(columnHeaders);
	
	for (const [name, data] of Object.entries(scores))
	{
		const row = document.createElement("li");
		row.style =
		`
			display: grid;
			grid-template-columns: auto max-content;
			background-color: inherit;
		`;
		row.appendChild(document.createTextNode(name));

		const pointsContainer = document.createElement("span");
		pointsContainer.textContent = data["score"];
		pointsContainer.style =
		`
			text-align: right;

		`;
		row.appendChild(pointsContainer);

		liveScores.appendChild(row);
	}

	const liveScoresHeader = document.createElement("h2");
	liveScoresHeader.id = "liveScoresHeader";
	liveScoresHeader.style.margin = "0";
	liveScoresHeader.textContent = "Quiz Scores";
	interfaceBox.insertBefore(liveScoresHeader, interfaceBox.querySelector(`#leaderboardHeader`));

	interfaceBox.insertBefore(liveScores, liveScoresHeader.nextElementSibling);
	return liveScores;
}

function addSuggestionsList()
{
	if (suggestions.length === 0)
	{
		return;
	}

	interfaceBox.appendChild(document.createElement("h3"));
	interfaceBox.lastChild.id = "suggestionsHeader";
	interfaceBox.lastChild.style =
	`
		margin: 0;
	`;
	interfaceBox.lastChild.textContent = "Suggestions";

	const suggestionsList = document.createElement("ol");
	suggestionsList.id = "suggestionsList";
	suggestionsList.style =
	`
		width: 100%;
		padding: 0;
		margin: auto;
		display: grid;
		grid-row-gap: 0.75em;
	`;

	suggestions.forEach(
		(suggestion) =>
		{
			const row = document.createElement("li");
			row.style =
			`
				display: block;
				grid-template-columns: max-content auto;
				cursor: pointer;
				text-decoration: underline;
			`;
			row.title = suggestion["long_title"];
			row.textContent = `${suggestion["username"]}: ${suggestion["short_title"]}`;
			row.addEventListener("click",
				(event) =>
				{
					suggestions = suggestions.filter(item => item !== suggestion);
					port.postMessage({type:"removeSuggestion", ...suggestion});
					window.location = suggestion["url"];
				}
			);
			suggestionsList.appendChild(row);
		}
	);
	const clearButton = document.createElement("button");
	clearButton.id = "clearSuggestions";
	clearButton.addEventListener("click", clearSuggestionList);
	clearButton.textContent = "Clear List";

	suggestionsList.appendChild(clearButton);

	interfaceBox.appendChild(suggestionsList);

	return suggestionsList;
}

function displayContextMenu(event)
{
	const target = event.currentTarget;
	let menu = document.querySelector(`#contextMenu`);
	if (menu !== null)
	{
		if (menu.parentNode === target)
		{
			return;
		}
		else
		{
			menu.remove();
		}
	}

	const top = event.clientY - target.getBoundingClientRect().top + target.offsetTop;
	const left = event.clientX - target.getBoundingClientRect().left + target.offsetLeft;

	const targetUsername = target.firstChild.textContent; 

	menu = document.createElement("ul");
	menu.id = "contextMenu";
	menu.style =
	`
		position: absolute;
		top: ${top}px;
		left: ${left}px;

		width: max-content;
		border: 1px solid #888;

		padding: 0.25em 0;

		box-shadow: 2px 2px 3px rgba(0,0,0, 0.5);

		list-style: none;
		background-color: white;

		display: grid;

		font-size: 85%;
	`;

	const mOver = (event) =>
	{
		event.target.style.backgroundColor = "#ccc";
	};
	const mOut = (event) =>
	{
		event.target.style.backgroundColor = "unset";
	}

	let menuItem = document.createElement("li");
	menuItem.textContent = `Make ${targetUsername} a host`;
	menuItem.style =
	`
		padding: 0.25em 2em;
	`;
	menuItem.addEventListener("mouseover", mOver);
	menuItem.addEventListener("mouseout", mOut);
	menuItem.addEventListener("click",
		(event) =>
		{
			port.postMessage({type: "make_host", username: targetUsername});
			removeContextMenu();
		}
	);
	menu.appendChild(menuItem);

	menuItem = menuItem.cloneNode(true);
	menuItem.textContent = `Swap with ${targetUsername} as a host`;
	menuItem.addEventListener("mouseover", mOver);
	menuItem.addEventListener("mouseout", mOut);
	menuItem.addEventListener("click",
		(event) =>
		{
			port.postMessage({type: "change_host", username: targetUsername});
			removeContextMenu();
		}
	);
	menu.appendChild(menuItem);

	menuItem = menuItem.cloneNode(true);
	menuItem.textContent = `Remove ${targetUsername} from room`;
	menuItem.addEventListener("mouseover", mOver);
	menuItem.addEventListener("mouseout", mOut);
	menuItem.addEventListener("click",
		(event) =>
		{
			port.postMessage({type: "remove_from_room", username: targetUsername});
			removeContextMenu();
		}
	);
	menu.appendChild(menuItem);


	target.appendChild(menu);
	if (menu.getBoundingClientRect().right > (window.innerWidth - 10))
	{
		menu.style.transform += `translateX(${window.innerWidth - menu.getBoundingClientRect().right - 10}px)`;
	}
	if (menu.getBoundingClientRect().bottom > (window.innerHeight - 10))
	{
		menu.style.transform += "translateY(-100%)";
	}


	menu.addEventListener("mouseup",
		(event) =>
		{
			event.stopPropagation();
		}
	);
	document.addEventListener("mouseup", removeContextMenu);
}

function removeContextMenu()
{
	const menu = document.querySelector(`#contextMenu`);
	if (menu !== null)
	{
		menu.remove();
	}

	document.removeEventListener("mouseup", removeContextMenu);
}

function quizStarted(mutationList)
{
	mutationList.forEach(
		(mutation) =>
		{
			if (
				(
					mutation.type === "childList"
					&& mutation.removedNodes.length !== 0
					&& Array.from(mutation.removedNodes).some(removed => removed.id === "playPadding")
				)
				||
				(
					mutation.type === "attributes" && mutation.target.getAttribute("style") !== null
				)
			)
			{
				// Quiz started
				quizStartObserver.disconnect();
				
				quizRunning = true;
				quizStartTime = new Date();

				port.postMessage({"type": "start_quiz"});
				sendLiveScore();

				// start observing changes to the score
				const scoreElement = document.querySelector(`.currentScore`);
				scoreObserver.observe(scoreElement, {childList: true});

				// start observing quiz end
				const resultsBox = document.querySelector(`#reckonBox`);
				quizFinishObserver.observe(resultsBox, {attributes: true});
			}
			else
			{
				return false;
			}
		}
	);
}

function quizFinished(mutationList)
{
	mutationList.forEach(
		(mutation) =>
		{
			if (mutation.target.getAttribute("style") !== null)
			{
				// Quiz finished

				quizFinishObserver.disconnect();
				scoreObserver.disconnect();

				quizRunning = false;

				sendLiveScore();
			}
			else
			{
				return false;
			}
		}
	);
}

function getCurrentScore()
{
	const scoreText = document.querySelector(`.currentScore`).textContent;

	return Number(scoreText.split("/")[0]);
}

function sendLiveScore()
{
	const currentScore = getCurrentScore();
	const elapsedTime = (new Date()) - quizStartTime;
	
	port.postMessage(
		{
			type: "live_scores_update",
			current_score: currentScore,
			quiz_time: elapsedTime,
			finished: !quizRunning,
		}
	);
}

function addCreateRoomForm()
{
	const form = document.createElement("form");
	form.id = "createRoomForm";
	form.autocomplete = "off";
	form.addEventListener("submit", createRoom);
	form.style = 
	`
		display: flex;
		flex-direction: column;
	`;

	const heading = document.createElement("h3");
	heading.textContent = "Create a Room";
	form.appendChild(heading);

	const usernameInput = document.createElement("input");
	usernameInput.id = "createRoomUsernameInput";
	usernameInput.setAttribute("type", "text");
	usernameInput.value = "Enter Username";
	if (options.useDefaultUsername && options.defaultUsername !== "")
	{
		usernameInput.value = options.defaultUsername;
	}

	form.appendChild(usernameInput);

	const button = document.createElement("input");
	button.id = "createRoomSubmit";
	button.setAttribute("type", "submit");
	button.value = "Create Room";
	if (usernameInput.value === "Enter Username")
	{
		button.disabled = true;
	}


	usernameInput.addEventListener("keyup", function ()
		{
			this.value = this.value.trimStart();
			button.disabled = this.value === "";
		}
	);

	usernameInput.addEventListener("focus", function ()
		{
			if (this.value === "Enter Username")
				this.value = "";
		}
	);

	usernameInput.addEventListener("blur", function ()
		{
			if (this.value === "")
				this.value = "Enter Username";
		}
	);

	form.appendChild(button);

	Array.from(form.children).forEach(
		(child) =>
		{
			if (child !== heading)
			{
				child.style =
				`
					width: min(100%, 10em);
					box-sizing: border-box;
					margin: 0 auto;
				`;
			}
		}
	);

	interfaceBox.appendChild(form);
}

function addJoinRoomForm()
{
	const form = document.createElement("form");
	form.id = "joinRoomForm";
	form.autocomplete = "off";
	form.addEventListener("submit", joinRoom);
	form.style = 
	`
		display: flex;
		flex-direction: column;
	`;

	const heading = document.createElement("h3");
	heading.textContent = "Join a Room";
	form.appendChild(heading);

	const usernameInput = document.createElement("input");
	usernameInput.id = "joinRoomUsernameInput";
	usernameInput.setAttribute("type", "text");
	usernameInput.value = "Enter Username";
	if (options.useDefaultUsername && options.defaultUsername !== "")
	{
		usernameInput.value = options.defaultUsername;
	}

	form.appendChild(usernameInput);

	const codeInput = document.createElement("input");
	codeInput.id = "joinRoomCodeInput";
	codeInput.setAttribute("type", "text");
	codeInput.value = "Enter Room Code";

	form.appendChild(codeInput);

	const button = document.createElement("input");
	button.id = "joinRoomSubmit";
	button.setAttribute("type", "submit");
	button.value = "Join Room";
	button.disabled = true;

	usernameInput.addEventListener("keyup", function ()
		{
			this.value = this.value.trimStart();
			button.disabled = (
				this.value === ""
				|| codeInput.value === ""
				|| codeInput.value === "Enter Room Code"
			);
		}
	);

	usernameInput.addEventListener("focus", function ()
		{
			if (this.value === "Enter Username")
				this.value = "";
		}
	);

	usernameInput.addEventListener("blur", function ()
		{
			if (this.value === "")
				this.value = "Enter Username";
		}
	);

	codeInput.addEventListener("keyup", function ()
		{
			this.value = this.value.trimStart();
			button.disabled = (
				this.value === ""
				|| usernameInput.value === ""
				|| usernameInput.value === "Enter Username"
			);
		}
	);

	codeInput.addEventListener("focus", function ()
		{
			if (this.value === "Enter Room Code")
				this.value = "";
		}
	);

	codeInput.addEventListener("blur", function ()
		{
			if (this.value === "")
				this.value = "Enter Room Code";
		}
	);

	form.appendChild(button);

	Array.from(form.children).forEach(
		(child) =>
		{
			if (child !== heading)
			{
				child.style =
				`
					width: min(100%, 10em);
					box-sizing: border-box;
					margin: 0 auto;
				`;
			}
		}
	);

	interfaceBox.appendChild(form);
}

function addLoadRoomForm(storedSaveNames)
{
	if (storedSaveNames.length === 0)
	{
		return;
	}
	const form = document.createElement("form");
	form.id = "loadRoomForm";
	form.autocomplete = "off";
	form.addEventListener("submit", (event) => {loadRoom(event, form)});
	form.style = 
	`
		display: flex;
		flex-direction: column;
	`;

	const heading = document.createElement("h3");
	heading.textContent = "Load a Saved Room";
	form.appendChild(heading);

	const saveSelect = document.createElement("select");
	saveSelect.id = "saveSelect";
	saveSelect.appendChild(document.createElement("option"));
	saveSelect.lastChild.value = "";
	saveSelect.lastChild.textContent = "--Select a Save--";

	storedSaveNames.forEach(
		(save) =>
		{
			const option = document.createElement("option");
			option.value = save;
			option.textContent = save;
			saveSelect.appendChild(option);
		}
	);

	form.appendChild(saveSelect);

	const button = document.createElement("input");
	button.id = "loadRoomSubmit";
	button.setAttribute("type", "submit");
	button.value = "Load Room";
	button.disabled = true;

	saveSelect.addEventListener("change",
		(event) =>
		{
			button.disabled = saveSelect.value === "";
		}
	);

	form.appendChild(button);

	Array.from(form.children).forEach(
		(child) =>
		{
			if (child !== heading)
			{
				child.style =
				`
					width: min(100%, 10em);
					box-sizing: border-box;
					margin: 0 auto;
				`;
			}
		}
	);

	interfaceBox.appendChild(form);
}
