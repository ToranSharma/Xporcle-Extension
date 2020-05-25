let port = null;

let onQuizPage = null;
let interfaceBox = null;
let roomCode = null;
let username = null;
let host = null;
let urls = {};
let hosts = [];
let suggestions = [];

let quizStartTime = null;
let quizRunning = false;

const quizStartObserver = new MutationObserver(quizStarted);
const scoreObserver = new MutationObserver(() => sendLiveScore());
const quizFinishObserver = new MutationObserver(quizFinished);


if (document.readyState === "complete" || document.readyState === "interactive")
{
	run()
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
			if (message.type == "optionsChanged" && /^\/games\/.*/.test(window.location.pathname))
			{
				init();
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
	init();
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
			port.postMessage({type: "connectionStatus", url: window.location.href});
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

		onRoomConnect(statusResponse["scores"]);
	}
	else
	{
		// Not connected so add room forms
		addCreateRoomForm();
		addJoinRoomForm();
	}
}

function addInterfaceBox()
{
	const centerContent = document.querySelector(`#CenterContent`);

	const gameHeader = document.querySelector(`.game-header`);
	const staffPicks = document.querySelector(`#staff-picks-wrapper`);

	let interfaceContainer = document.querySelector(`#interfaceContainer`);
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

function resetInterface()
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

	Array.from(interfaceBox.childNodes).forEach(
		(element) => element.remove()
	);

	init();
}

function processMessage(message)
{
	messageType = message["type"];

	switch (messageType)
	{
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
		case "hosts_update":
			hosts = message["hosts"];
			if (host && !hosts.includes(username))
			{
				// Not a host anymore
				host = false;
				
				// Remove host features
				toggleQuizStartProvention(true);
				document.querySelector(`#changeQuizButton`).remove();

				urls = {};
				updateLeaderboardUrls();

				suggestions = [];
				document.querySelectorAll(`#suggestionsHeader, #suggestionsList`).forEach(element => element.remove());

				addSuggestionQuizButton();
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
			break;
		case "start_quiz":
			// Start the quiz!

			if (!quizRunning)
			{
				// First remove the quiz start provention
				toggleQuizStartProvention(false);
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
async function createRoom(event, form)
{
	event.preventDefault();

	username = form.querySelector(`input[type="text"]`).value.trim();
	const button = form.querySelector(`input[type="submit"]`);
	button.disabled = true;
	button.value = "...";

	const message = {
		type: "create_room",
		username: username,
		url: window.location.href
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
					if (message.type === "new_room_code")
					{
						roomCode = message.room_code;
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
		await navigator.clipboard.writeText(roomCode);
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

	host = true;
	hosts = [username];

	onRoomConnect();
}

async function joinRoom(event, form)
{
	event.preventDefault();

	username = form.querySelector(`#joinRoomUsernameInput`).value.trim();
	roomCode = form.querySelector(`#joinRoomCodeInput`).value.trim();

	const button = form.querySelector(`input[type="submit"]`);
	button.disabled = true;
	button.value = "...";

	const message = {
		type: "join_room",
		username: username,
		code: roomCode,
		url: window.location.href
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
		console.error(error);
		resetInterface();
		return;
	}

	onRoomConnect();
}

function onRoomConnect(existingScores)
{
	// Set up message handing
	port.onMessage.addListener(processMessage);

	// Clear the interface box of the forms
	interfaceBox.querySelectorAll(`form`).forEach(
		(form) => form.remove()
	);

	// Display the room code
	interfaceBox.appendChild(document.createElement("h4"));
	interfaceBox.lastChild.id = "roomCodeHeader";
	interfaceBox.lastChild.textContent = `Room code: ${roomCode}`;
	interfaceBox.lastChild.style.margin = "0";

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
		scores[username] = 0;
	}

	updateLeaderboard(scores);

	// Add a button to leave the room
	interfaceBox.appendChild(document.createElement("button"));
	interfaceBox.lastChild.textContent = "Leave Room";
	interfaceBox.lastChild.addEventListener("click",
		(event) => {
			port.postMessage({type: "leave_room"});
		}
	);

	// If on a quiz page, observe for the start of the quiz
	if (onQuizPage)
	{
		// add observer for quiz starting
		const startButtons = document.querySelector(`#playPadding`);
		quizStartObserver.observe(startButtons, {attributes: true});
	}

	// If not a host and on a quiz, stop the user from starting any quizzes
	if (!host && onQuizPage)
	{
		toggleQuizStartProvention(true);
	}

	if (host)
	{
		updateLeaderboardUrls();
		updateSuggestionList();
	}
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

function updateLeaderboard(scores)
{
	const scoresCopy = JSON.parse(JSON.stringify(scores));
	let leaderboard = interfaceBox.querySelector(`#leaderboard`);
	if (leaderboard === null)
		leaderboard = addLeaderboard(scores);

	const rows = leaderboard.querySelectorAll(`li`);
	rows.forEach(
		(row) => {
			const nameElem = row.firstChild;
			const pointsElem = row.lastChild;
			if (scores[nameElem.textContent] !== undefined)
			{
				pointsElem.textContent = scores[nameElem.textContent];
				delete scores[nameElem.textContent];
			}
			else
			{
				row.remove();
			}
		}
	);

	for (const [name, points] of Object.entries(scores))
	{
		const row = rows[0].cloneNode(true);
		row.firstChild.textContent = name;
		row.firstChild.nextElementSibling.textContent = (hosts.includes(name)) ? "host" : "";
		row.lastChild.textContent = points;

		leaderboard.appendChild(row);
	}

	updateContextMenuHandling();

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

	const byScore = (a, b) =>
	{
		const aName = a.firstChild.textContent;
		const bName = b.firstChild.textContent;
		const aScore = scores[aName];
		const bScore = scores[bName];

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
}

function updateContextMenuHandling()
{
	document.querySelectorAll(`#leaderboard > li`).forEach(
		(row) =>
		{
			if (host && !hosts.includes(row.firstChild.textContent))
			{
				row.addEventListener("contextmenu", cmEventHandle);
			}
			else
			{
				row.removeEventListener("contextmenu", cmEventHandle);
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
			if (name !== username && (name in urls) && urls[name] !== window.location.href)
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
		const allPlayersOnSamePage = ! Object.entries(urls).some(entry => entry[1] !== window.location.href);

		toggleQuizStartProvention(allPlayersOnSamePage === false)
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
		const row = suggestionsList.lastChild.cloneNode(true);
		row.title = newSuggestion["long_title"];
		row.textContent = `${newSuggestion["username"]}: ${newSuggestion["short_title"]}`;
		row.addEventListener("click",
			(event) =>
			{
				suggetions = suggestions.filter(item => item !== newSuggestion);
				port.postMessage({type:"removeSuggestion", ...newSuggestion});
				window.location = newSuggestion["url"];
			}
		);
		suggestionsList.appendChild(row);
	}
}

function toggleQuizStartProvention(prevent)
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
	const leaderboard = document.createElement("ol");
	leaderboard.id = "leaderboard";
	leaderboard.style =
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

	leaderboard.appendChild(columnHeaders);

	for (const [name, points] of Object.entries(scores))
	{
		const row = document.createElement("li");
		row.style =
		`
			display: grid;
			grid-template-columns: fit-content(80%) auto max-content;
		`;
		row.appendChild(document.createTextNode(name));

		row.appendChild(document.createElement("span"));
		row.lastChild.style =
		`
			font-size: 80%;
			font-style: oblique;
			padding-left: 0.5em;
			align-self: end;
		`;
		row.lastChild.textContent = (hosts.includes(name)) ? "host" : "";

		const pointsContainer = document.createElement("span");
		pointsContainer.textContent = points;
		pointsContainer.style =
		`
			text-align: right;
		`;
		row.appendChild(pointsContainer);
		
		leaderboard.appendChild(row);
	}

	updateContextMenuHandling();

	const leaderboardHeader = document.createElement("h2");
	leaderboardHeader.id = "leaderboardHeader";
	leaderboardHeader.style.margin = "0";
	leaderboardHeader.textContent = "Overall Rankings";
	interfaceBox.appendChild(leaderboardHeader);

	interfaceBox.appendChild(leaderboard);
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
			port.postMessage({type: "host_promotion", username: targetUsername});
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
			if (mutation.target.getAttribute("style") !== null)
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
	form.addEventListener("submit", (event) => {createRoom(event, form)});
	form.style = 
	`
		display: grid;
		grid-template-columns: min(100%, 10em);
	`;

	const heading = document.createElement("h3");
	heading.textContent = "Create a Room";
	form.appendChild(heading);

	const usernameInput = document.createElement("input");
	usernameInput.id = "createRoomUsernameInput";
	usernameInput.setAttribute("type", "text");
	usernameInput.value = "Enter Username";

	form.appendChild(usernameInput);

	const button = document.createElement("input");
	button.id = "createRoomSubmit";
	button.setAttribute("type", "submit");
	button.value = "Create Room";
	button.disabled = true;


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

	interfaceBox.appendChild(form);
}

function addJoinRoomForm()
{
	const form = document.createElement("form");
	form.id = "joinRoomForm";
	form.autocomplete = "off";
	form.addEventListener("submit", (event) => {joinRoom(event, form)});
	form.style = 
	`
		display: grid;
		grid-template-columns: min(100%, 10em);
	`;

	const heading = document.createElement("h3");
	heading.textContent = "Join a Room";
	form.appendChild(heading);

	const usernameInput = document.createElement("input");
	usernameInput.id = "joinRoomUsernameInput";
	usernameInput.setAttribute("type", "text");
	usernameInput.value = "Enter Username";

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

	interfaceBox.appendChild(form);
}
