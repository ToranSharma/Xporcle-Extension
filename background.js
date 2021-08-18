// Open page tracking and options page request handling
const pages = {
	openedTabs: []
};

chrome.runtime.onMessage.addListener(
	(message, sender, sendResponse) =>
	{
		if (message.type == "showPageAction")
		{
			chrome.pageAction.show(sender.tab.id);
			if (!pages.openedTabs.includes(sender.tab.id))
				pages.openedTabs.push(sender.tab.id);
		}
		if (message.type == "pageClosed")
		{
			const index = pages.openedTabs.indexOf(sender.tab.id);
			if (index != -1)
				pages.openedTabs.splice(index, 1);
		}
		if (message.type == "tabsRequest")
		{
			sendResponse(pages);
		}
	}
);

// Web Socket Handling

let ws = null;
let roomCode = null;
let username = null;
let host = null;
let messagePort = null;
let scores = {};
let urls = {};
let hosts = [];
let suggestions = [];
let playing = null;
let pollData = {};
let voteData = {};
let voted = false;
let saveName = null;
let queue = [];

chrome.runtime.onConnect.addListener(
	(port) =>
	{
		if (port.name === "messageRelay")
		{
			messagePort = port;
			port.onMessage.addListener(
				(message) =>
				{
					if (message.type === "connectionStatus")
					{
						// Request to see if we are still connected to a room
						if (ws !== null)
						{
							port.postMessage(
								{
									type: "connectionStatus",
									connected: true,
									room_code: roomCode,
									username: username,
									host: host,
									scores: scores,
									urls: urls,
									hosts: hosts,
									suggestions: suggestions,
									poll_data: pollData,
									vote_data: voteData,
									saveName: saveName,
									voted: voted,
									queue: queue
								}
							);
							ws.send(JSON.stringify({type: "url_update", url: message["url"]}))
						}
						else
						{
							port.postMessage({type: "connectionStatus", connected: false});
						}
						
					}
					else if (message.type === "startConnection")
					{
						startConnection(message.initialMessage);
					}
					else if (message.type === "removeSuggestion")
					{
						suggestions = suggestions.filter(
							(suggestion) =>
							{
								return !(
									suggestion["username"] === message["username"]
									&& suggestion["url"] === message["url"]
									&& suggestion["short_title"] === message["short_title"]
									&& suggestion["long_title"] === message["long_title"]
								);
							}
						);
					}
					else if (message.type === "saveName")
					{
						saveName = message["saveName"];
					}
					else if (message.type === "clearVoteData")
					{
						voteData = {};
						voted = false;
					}
					else
					{
						// This is a message to forward on to the server
						ws.send(JSON.stringify(message));
						
						if (message.type === "live_scores_update")
						{
							playing = !message["finished"]
						}
						else if (
							message.type === "poll_create"
							|| message.type === "poll_data_update"
						)
						{
							pollData = message["poll_data"];
						}
						else if (message.type === "poll_start")
						{
							pollData = {};
						}
						if (message.type === "poll_vote")
						{
							voted = true;
						}
					}
				}
			);

			// Handle port disconnect
			port.onDisconnect.addListener(
				() =>
				{
					messagePort = null;

					if (playing)
					{
						playing = false;
						// Send message to server that the player's playing state is false
						ws.send(JSON.stringify({type: "page_disconnect"}));
					}
				}
			);
		}
	}
);


function startConnection(initialMessage)
{
	username = initialMessage.username;

	if (initialMessage["code"] !== undefined)
	{
		roomCode = initialMessage["code"];
	}
	
	if (initialMessage["type"] == "load_room")
	{
		// We are loading from a save.
		saveName = initialMessage["saveName"];
		delete initialMessage["saveName"]; // This doesn't need to be sent to the sever.
		scores = initialMessage["scores"];
	}

	ws = new WebSocket("wss://toransharma.com/xporcle")

	ws.onerror = (error) => 
	{
		throw error;
	};
	ws.onclose = (event) =>
	{
		if (messagePort != null)
			messagePort.postMessage({type: "connection_closed"});
		reset();
	};
	ws.onopen = (event) =>
	{
		ws.send(JSON.stringify(initialMessage));
	};

	ws.onmessage = forwardMessage;
}

function forwardMessage(event)
{
	const message = JSON.parse(event.data);

	messageType = message["type"];

	if (
		messageType === "create_room"
		|| messageType == "load_room"
	)
	{
		host = true;
		hosts = [username];
		roomCode = message["room_code"];
	}
	else if (messageType === "join_room")
	{
		if (message["success"])
		{
			hosts = message["hosts"];
			queue = message["queue"];
		}
		else
		{
			ws.close();
			reset();
		}
	}
	else if (messageType === "hosts_update")
	{
		if (message["added"] !== undefined)
		{
			hosts.push(message["added"]);
		}
		else
		{
			hosts = hosts.filter(username => username !== message["removed"]);
		}
		if (!hosts.includes(username))
		{
			host = false;
			urls = {};
			suggestions = [];
			pollData = {};
		}
	}
	else if (messageType === "host_promotion")
	{
		host = true;
		urls = message["urls"];
		poll_data = message["poll_data"] ?? {};
		queue = message["queue"];
	}
	else if (
		messageType === "users_update"
		|| messageType === "scores_update"
	)
	{
		scores = message["scores"];
	}
	else if (messageType === "start_quiz")
	{
		playing = true;
	}
	else if (messageType === "quiz_finished")
	{
		playing = false;
	}
	else if (messageType === "suggest_quiz")
	{

		const duplicate = suggestions.some(
			(suggestion) =>
			{
				return (
					suggestion["username"] === message["username"]
					&& suggestion["url"] === message["url"]
					&& suggestion["short_title"] === message["short_title"]
					&& suggestion["long_title"] === message["long_title"]
				);
			}
		);
		if (!duplicate)
		{
			const suggestion = Object.assign({}, message);
			delete suggestion["type"];
			suggestions.push(suggestion);
		}
		else
		{
			return;
		}
	}
	else if (messageType === "url_update")
	{
		urls[message["username"]] = message["url"];
	}
	else if (messageType === "removed_from_room")
	{
		const removedUser = message["username"];
		if (removedUser === username)
		{
			ws.close();
			reset();
		}
		else
		{
			delete urls[removedUser];
			delete hosts[removedUser];
		}
	}
	else if
	(
		messageType === "poll_create"
		|| messageType === "poll_data_update"
	)
	{
		pollData = message["poll_data"];
	}
	else if (messageType === "poll_start")
	{
		pollData = {};
		voted = false;
		voteData = message["vote_data"];
	}
	else if (messageType === "vote_update")
	{
		voteData = message["vote_data"];
	}
	else if (messageType === "queue_update")
	{
		queue = message["queue"];
	}

	if (messagePort !== null)
	{
		messagePort.postMessage(message);
	}
}

function reset()
{
	ws = null;
	username = null;
	roomCode = null;
	host = null;
	scores = {};
	urls = {};
	hosts = [];
	playing = null;
	pollData = {};
	voteData = {};
	saveName = null;
	voted = false;
	queue = [];
}
