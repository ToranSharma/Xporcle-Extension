let port = null;

let onQuizPage = null;
let interfaceBox = null;
let interfaceContainer = null;
let sectionContainer = null;
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
						applyOptions();
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
	// Add StyleSheet
	addStyleSheet();

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
		const queue =  Object.keys(statusResponse["queue"]).length !== 0 ? statusResponse["queue"] : undefined;
		const queueInterval = statusResponse["queue_interval"];
		onRoomConnect(statusResponse["scores"], pollData, voteData, queue, queueInterval);
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
					blurRoomCode: false,
					defaultPollDuration: 30,
					defaultQuizQueueInterval: 60
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

			// And apply them.
			applyOptions();

			resolve();
		});
	});
}

function applyOptions()
{
	// Default Username
	const forms = document.querySelectorAll(`#interfaceBox form`);
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
	if (options.blurRoomCode)
	{
		document.body.classList.add("blurRoomCode");
	}
	else
	{
		document.body.classList.remove("blurRoomCode");
	}
}

function addStyleSheet()
{
	if (document.head.querySelector("#xporcleStyleSheet") === null)
	{
		// We haven't previously added the stylesheet

		const linkElem = document.createElement("link");
		linkElem.type = "text/css";
		linkElem.rel = "stylesheet";
		linkElem.href = chrome.runtime.getURL("stylesheets/interface.css");

		linkElem.id = "xporcleStyleSheet";

		document.head.append(linkElem);
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
			--center-content-padding-right: ${window.getComputedStyle(centerContent).paddingRight};
		`;
		sectionContainer = document.createElement("div");
		sectionContainer.id = "sectionContainer";
		interfaceContainer.append(sectionContainer);

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
		interfaceBox.classList.add("interfaceSection");
		sectionContainer.appendChild(interfaceBox);
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

	document.querySelectorAll(".interfaceSection:not(#interfaceBox)").forEach(section => section.remove());

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
				document.querySelectorAll(
					`
						#changeQuizButton,
						#suggestionsHeader, #suggestionsList,
						#saveButton,
						#createPollButton, #pollBox,
						#addQuizToQueueButton, #quizQueueBox form, #quizQueueBox ol button
					`
				).forEach(element => element.remove());
				document.querySelectorAll(`#quizQueueBox ol li`).forEach(li => li.removeAttribute("draggable"));

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
			if (onQuizPage)
			{
				interfaceBox.append(addQuizToQueueButton());
			}
			if (message["queue"] !== null)
			{
				document.querySelector("#quizQueueBox")?.remove();
				addQuizQueueBox(message["queue"], message["queue_interval"]);
			}

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
		case "queue_update":
			updateQuizQueue(message["queue"], message["queue_interval"]);
			break;
		case "start_change_quiz_countdown":
			{
				const endTime = (new Date()).getTime() + message["countdown_length"]*1000;
				const timeLeft = () => (Math.max(0, endTime - (new Date()).getTime())/1000).toFixed(1);
				const countdown = document.createElement("div");
				countdown.id = "changeQuizCountdown";
				countdown.append(document.createElement("span"));
				countdown.firstChild.textContent = `Changing to next quiz in ${timeLeft()}s`;
				setInterval(
					() =>
					{
						if (countdown.firstChild.textContent !== "Change quiz countdown cancelled")
						{
							countdown.firstChild.textContent = `Changing to next quiz in ${timeLeft()}s`;
						}
					}
					, 100
				);
				if (host)
				{
					const cancelButton = document.createElement("button");
					cancelButton.textContent = "Cancel Countdown";
					cancelButton.addEventListener("click",
						(event) =>
						{
							port.postMessage({type: "change_queue_interval", queue_interval: null});
						}
					);
					countdown.append(cancelButton);
				}
				document.querySelector("#interfaceBox")?.insertBefore(countdown, document.querySelector("#leaderboard").nextElementSibling);
				break;
			}
		case "cancel_change_quiz_countdown":
			{
				const countdownMessage = document.querySelector("#changeQuizCountdown span");
				countdownMessage.textContent = "Change quiz countdown cancelled";
				document.querySelector("#changeQuizCountdown button")?.remove();
				setTimeout(() => countdownMessage.parentNode.remove(), 2000);
				break;
			}
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
	let queue = undefined;
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
							queue = message["queue"] ?? undefined;

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
		window.setTimeout(() => {errorMessageBox.remove();}, 5000);

		resetInterface(errorMessageBox,
			(error !== "username taken") ? username : undefined,
			(error !== "invalid code") ? roomCode : undefined
		);
		return;
	}

	onRoomConnect(undefined, undefined, undefined, queue);
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
function onRoomConnect(existingScores, existingPollData, currentVoteData, queue, queueInterval)
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
	roomCodeHeader.textContent = "Room code: ";
	roomCodeHeader.appendChild(document.createElement("span"));
	roomCodeHeader.lastChild.textContent = roomCode;
	interfaceBox.insertBefore(roomCodeHeader, interfaceBox.firstElementChild);

	interfaceBox.insertBefore(collapseToggle(),roomCodeHeader.nextElementSibling);

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

		// Poll
		if (existingPollData)
		{
			addCreatePollBox(existingPollData);
		}
		else
		{
			addCreatePollButton();
		}

		// Add Quiz to Queue
		if (onQuizPage)
		{
			interfaceBox.append(addQuizToQueueButton());
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

	// Quiz Queue
	if (queue)
	{
		addQuizQueueBox(queue, queueInterval);
	}


	// If on a quiz page, observe for the start of the quiz
	if (onQuizPage)
	{
		if (host)
		{
			// Add new button covering start button which will start the count down;
			const playButton = document.querySelector("#button-play");

			const buttonContainer = document.createElement("div");
			buttonContainer.id = "startCountdownButtonContainer";

			const startCountdownButton = playButton.cloneNode(true);
			startCountdownButton.id = "startCountdown";
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
	interfaceBox.insertBefore(changeQuizButton, interfaceBox.querySelector(`.toggle`).nextElementSibling);
}

function currentQuizInfo()
{
	const url = window.location.href;
	const shortTitle = document.querySelector(`title`).textContent;
	const longTitle = document.querySelector("#gameMeta>h2").textContent;

	return {url: url, short_title: shortTitle, long_title: longTitle};
}

function addSuggestionQuizButton()
{
	const quizInfo = currentQuizInfo();

	const suggestQuizButton = document.createElement("button");
	suggestQuizButton.id = "suggestQuizButton";
	suggestQuizButton.textContent = "Suggest Quiz to Hosts";
	suggestQuizButton.addEventListener("click",
		(event) =>
		{
			port.postMessage(
				{
					type: "suggest_quiz",
					url: quizInfo.url,
					short_title: quizInfo.short_title,
					long_title: quizInfo.long_title
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
			const pollData = {duration: options.defaultPollDuration, entries: []};
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
	pollBox.classList.add("interfaceSection");
	
	pollBox.append(closeButton(pollBox));

	const header = document.createElement("h2");
	header.textContent = "Next Quiz Poll";
	pollBox.append(header);

	pollBox.append(collapseToggle());

	if (onQuizPage)
	{
		// Get info about quiz from page
		const quizInfo = currentQuizInfo();

		const addCurrentQuizToPollButton = document.createElement("button");
		addCurrentQuizToPollButton.textContent = "Add Quiz to Poll";
		addCurrentQuizToPollButton.id = "addCurrentQuizToPoll";
		addCurrentQuizToPollButton.addEventListener("click",
			(event) =>
			{
				if (!pollData.entries.some(existingQuiz => existingQuiz.url === quizInfo.url))
				{
					pollData.entries.push(quizInfo);
					const newEntryListItem = document.createElement("li");

					newEntryListItem.textContent = quizInfo.short_title;

					removeEntryButton = document.createElement("div");
					removeEntryButton.textContent = "×";
					removeEntryButton.addEventListener("click",
						(event) =>
						{
							newEntryListItem.remove();
							pollData.entries = pollData.entries.filter(existingEntry => existingEntry.url !== quizInfo.url);
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
	pollEntriesList.id = "pollEntriesList";

	for (const entry of pollData.entries)
	{
		const entryListItem = document.createElement("li");
		entryListItem.textContent = entry.short_title;
		removeEntryButton = document.createElement("div");
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
			pollData.duration = Math.max(10, Math.min(Number(pollDurationInput.value), 60));
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

	sectionContainer.insertBefore(pollBox, interfaceBox.nextElementSibling);
}

function updateCreatePollBox(pollData)
{
	const pollBox = document.querySelector("#pollBox");
	if (pollBox === null)
	{
		return addCreatePollBox(pollData);
	}

	// Clear entires
	pollBox.querySelectorAll("ol li").forEach(entry => entry.remove());
	// Add updated entries
	for (const entry of pollData.entries)
	{
		const entryListItem = document.createElement("li");
		entryListItem.id = entry.short_title;
		entryListItem.textContent = entry.short_title;
		removeEntryButton = document.createElement("div");
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
	voteInfoBox.classList.add("interfaceSection");

	voteInfoBox.append(
		closeButton(voteInfoBox,
			(event) =>
			{
				if (document.querySelector("#timeLeft")?.textContent === "Finished")
				{
					port.postMessage({type: "clearVoteData"});
				}
			}
		)
	);

	const header = document.createElement("h2");
	header.textContent = "Vote Status";
	voteInfoBox.append(header);

	voteInfoBox.append(collapseToggle());

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

	sectionContainer.append(voteInfoBox);

	updateVoteInfoBox(voteData);
}

function updateVoteInfoBox(voteData)
{
	const voteInfoBox = document.querySelector("#voteInfoBox");
	if (voteInfoBox === null)
	{
		if (voteData.finished)
		{
			return addVoteInfoBox(voteData);
		}
		else
		{
			return false;
		}
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

	ballotPopout.append(closeButton(ballotPopout));

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
	for (const entry of poll.entries)
	{
		const entryListItem = document.createElement("li");
		entryListItem.textContent = entry.long_title;

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
				row.classList.add("hasContextMenu");
			}
			else
			{
				row.removeEventListener("contextmenu", cmEventHandle);
				row.classList.remove("hasContextMenu");
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
				row.classList.add("onDifferentPage");
			}
			else
			{
				row.classList.remove("onDifferentPage");
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
	
	const countElement = document.createElement("span");

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
					row.classList.add("finished");
				}
				else
				{
					row.classList.remove("finished");
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

	const columnHeaders = document.createElement("h3");
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Name";
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Wins";
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Points";

	leaderboard.appendChild(columnHeaders);

	for (const [name, {score, wins}] of Object.entries(scores))
	{
		const row = document.createElement("li");

		// Username
		const usernameContainer = document.createElement("span");
		usernameContainer.textContent = name;
		row.appendChild(usernameContainer);

		// Host
		row.appendChild(document.createElement("span"));
		row.lastChild.textContent = (hosts.includes(name)) ? "host" : "";

		// Wins
		const winsContainer = document.createElement("span");
		winsContainer.textContent = wins;
		row.appendChild(winsContainer);

		// Points
		const pointsContainer = row.lastChild.cloneNode(true);
		pointsContainer.textContent = score;
		row.appendChild(pointsContainer);
		
		leaderboard.appendChild(row);
	}


	const leaderboardHeader = document.createElement("h2");
	leaderboardHeader.id = "leaderboardHeader";
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

	const columnHeaders = document.createElement("h3");

	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Name";
	columnHeaders.appendChild(document.createElement("span"));
	columnHeaders.lastChild.textContent = "Points";

	liveScores.appendChild(columnHeaders);
	
	for (const [name, data] of Object.entries(scores))
	{
		const row = document.createElement("li");
		row.appendChild(document.createTextNode(name));

		const pointsContainer = document.createElement("span");
		pointsContainer.textContent = data["score"];
		row.appendChild(pointsContainer);

		liveScores.appendChild(row);
	}

	const liveScoresHeader = document.createElement("h2");
	liveScoresHeader.id = "liveScoresHeader";
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
	interfaceBox.lastChild.textContent = "Suggestions";

	const suggestionsList = document.createElement("ol");
	suggestionsList.id = "suggestionsList";

	suggestions.forEach(
		(suggestion) =>
		{
			const row = document.createElement("li");
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
		--top: ${top}px;
		--left: ${left}px;
		--translate-x: 0px;
		--translate-y: 0px;
	`;

	let menuItem = document.createElement("li");
	menuItem.textContent = `Make ${targetUsername} a host`;
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
	menuItem.addEventListener("click",
		(event) =>
		{
			port.postMessage({type: "remove_from_room", username: targetUsername});
			removeContextMenu();
		}
	);
	menu.appendChild(menuItem);


	target.appendChild(menu);
	if (menu.getBoundingClientRect().right > (window.innerWidth - 20))
	{
		menu.style.setProperty("--translate-x", `${window.innerWidth - menu.getBoundingClientRect().right - 20}px`);
	}
	if (menu.getBoundingClientRect().bottom > (window.innerHeight - 10))
	{
		menu.style.setProperty("--translate-y", "-100%");
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

	interfaceBox.appendChild(form);
}

function addJoinRoomForm()
{
	const form = document.createElement("form");
	form.id = "joinRoomForm";
	form.autocomplete = "off";
	form.addEventListener("submit", joinRoom);

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

	interfaceBox.appendChild(form);
}

function closeButton(elementToClose, closeFunction = null) 
{
	const button = document.createElement("button");
	button.classList.add("closeButton");

	button.addEventListener("click",
		(event) =>
		{
			if (closeFunction !== null)
			{
				closeFunction(event);
			}
			elementToClose.remove();
		}
	);

	return button;
}

function collapseToggle()
{
	const toggle = document.createElement("input");
	toggle.type = "checkbox";
	toggle.classList.add("toggle");

	return toggle;
}

function addQuizToQueueButton()
{
	const button = document.createElement("button");
	button.textContent = "Add Quiz to Queue";
	button.addEventListener("click",
		(event) =>
		{
			const quizInfo = currentQuizInfo();
			const existingQueuedQuizes = Array.from(document.querySelectorAll("#quizQueueBox ol li"));

			if (!existingQueuedQuizes.find(queuedQuiz => queuedQuiz.short_title === quizInfo.short_title))
			{
				port.postMessage({type: "add_to_queue", quiz: quizInfo});
			}
		}
	);
	return button;
}

function addQuizQueueBox(queue = [], queueInterval)
{
	const quizQueueBox = document.createElement("div");
	quizQueueBox.classList.add("interfaceSection");
	quizQueueBox.id = "quizQueueBox";

	quizQueueBox.append(closeButton(quizQueueBox));

	const header = document.createElement("h2");
	header.textContent = "Quiz Queue";
	quizQueueBox.append(header);

	quizQueueBox.append(collapseToggle());

	const queueList = document.createElement("ol");
	quizQueueBox.append(queueList);

	if (host)
	{
		const queueAutoChangeForm = document.createElement("form");

		const autoChangeToggleInput = document.createElement("input");
		autoChangeToggleInput.type = "checkbox";
		autoChangeToggleInput.checked = !!queueInterval;
		const intervalLabel = document.createElement("label");
		intervalLabel.textContent = "auto change quiz after ";
		const intervalInput = document.createElement("input");
		intervalInput.type = "number";
		intervalInput.min = 10;
		intervalInput.max = 60*5;
		intervalInput.value = queueInterval ?? options.defaultQuizQueueInterval;
		intervalInput.disabled = !autoChangeToggleInput.checked;
		[autoChangeToggleInput, intervalInput].forEach(
			(input) =>
			{
				input.addEventListener("change",
					(event) =>
					{
						intervalInput.disabled = !autoChangeToggleInput.checked;
						intervalInput.value = Math.max(10, Math.min(Number(intervalInput.value), 60*5));
						const newQueueInterval = autoChangeToggleInput.checked ? Number(intervalInput.value) : null;
						port.postMessage({type: "change_queue_interval", queue_interval: newQueueInterval});
					}
				);
			}
		);
		queueAutoChangeForm.append(
			autoChangeToggleInput, intervalLabel, intervalInput,  document.createTextNode("s")
		);
		quizQueueBox.append(queueAutoChangeForm);
	}

	sectionContainer.append(quizQueueBox);

	updateQuizQueue(queue, queueInterval);
}

function updateQuizQueue(queue, queueInterval)
{
	let quizQueueBox = document.querySelector("#quizQueueBox");
	if (queue.length === 0)
	{
		return quizQueueBox?.remove();
	}
	if (quizQueueBox === null)
	{
		return addQuizQueueBox(queue, queueInterval);
	}


	const queueList = quizQueueBox.querySelector("ol");
	Array.from(queueList.querySelectorAll("li"))
		.filter(li => !queue.some(queuedQuiz => queuedQuiz.short_title === li.textContent))
		.forEach(li => li.remove());

	queue.forEach(
		(queuedQuiz) =>
		{
			let li = Array.from(queueList.querySelectorAll("li")).find(li => li.textContent === queuedQuiz.short_title);
			if (li === undefined)
			{
				li = document.createElement("li");
				li.textContent = queuedQuiz.short_title;
				if (host)
				{
					// Add go to button
					const goToButton = document.createElement("button");
					goToButton.classList.add("goTo");
					goToButton.addEventListener("click", (event) => {window.location = queuedQuiz.url});
					li.append(goToButton);
					// Add Remove Button
					li.append(
						closeButton(li,
							(event) =>
							{
								port.postMessage({type: "remove_from_queue", quiz: queuedQuiz});
							}
						)
					);
					// Make list draggable to reorder queue.
					li.setAttribute("draggable", "true");
					li.addEventListener("dragstart",
						(event) =>
						{
							const quizInfoString = JSON.stringify(queuedQuiz);
							event.dataTransfer.setData("text/quizinfo", quizInfoString);
							const dragImage = document.createElement("div");
							dragImage.id = "tempDragImage";
							dragImage.style =
							`
								position: absolute;
								top: -2000vh;
								left: -2000vw;
								width: calc(${event.target.clientWidth}px - ${window.getComputedStyle(event.target).paddingRight});
							`;
							dragImage.textContent = queuedQuiz.short_title;
							document.body.append(dragImage);

							event.dataTransfer.setDragImage(dragImage, 30, dragImage.clientHeight/2);
							event.dataTransfer.effectAllowed = "move";
							event.target.classList.add("moving");
						}
					);
					li.addEventListener("dragend",
						(event) =>
						{
							event.target.classList.remove("moving");
							event.target.style = "";
							document.querySelector("#tempDragImage")?.remove();
						}
					);
					li.addEventListener("dragenter",
						(event) =>
						{
							if (event.dataTransfer.types.includes("text/quizinfo"))
							{
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								const beingDragged = queueList.querySelector(".moving");

								const indexOffset =
									Array.from(queueList.childNodes).indexOf(event.target)
									- Array.from(queueList.childNodes).indexOf(beingDragged);
								if (indexOffset > 0)
								{
									// Element being dragged is above the target.
									// So we want to move the dragged element to just below/after it.
									queueList.insertBefore(beingDragged, event.target.nextElementSibling);
								}
								else
								{
									// Element being dragged is below the target
									// So we want to move the dragged element to just above/before it.
									queueList.insertBefore(beingDragged, event.target);
								}
							}
						}
					);
					li.addEventListener("dragover",
						(event) =>
						{
							if (event.dataTransfer.types.includes("text/quizinfo"))
							{
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
							}
						}
					);
					li.addEventListener("drop",
						(event) =>
						{
							const newIndex = Array.from(queueList.children).indexOf(document.querySelector(".moving"));
							port.postMessage({type: "reorder_queue", quiz: queuedQuiz, index: newIndex});
						}
					);
				}
			}
			queueList.append(li);
		}
	);

	if (host)
	{
		// Update Queue Interval
		const autoChangeToggleInput = quizQueueBox.querySelector(`form input[type="checkbox"]`);
		const intervalInput = quizQueueBox.querySelector(`form input[type="number"]`);
		autoChangeToggleInput.checked = !!queueInterval;
		intervalInput.disabled = !queueInterval;
		intervalInput.value = queueInterval ?? intervalInput.value;
	}
}
