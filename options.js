var options = Object();
var tabs = [];

function subOptionsActive(option)
{
	return (
		(!option.className.includes("negative") && option.checked) ||
		(option.className.includes("negative") && !option.checked) ||
		(option.className.includes("selective") && option.getAttribute("subOptionsEnabled").includes(option.value))
	);
}

function setSubOptionsDisabled(option, disabled)
{
	option.parentNode.querySelectorAll(":scope>ul .option").forEach(
		(subOption) => {
			subOption.disabled = disabled;
			if (disabled) subOption.parentNode.classList.add("off");
			else subOption.parentNode.classList.remove("off");
		}
	);
}

function enableSubOptions(option)
{
	setSubOptionsDisabled(option, false);
	directSubOptions = option.parentNode.querySelectorAll(":scope>ul>li>.option");
	directSubOptions.forEach(
		(subOption) => {
			if (!subOptionsActive(subOption))
				setSubOptionsDisabled(subOption, true);
			else
				enableSubOptions(subOption);
		}
	);
}

function init()
{
	for (element of document.getElementsByClassName("option"))
	{
		// Go through all the option elements
		if (element.parentNode.querySelectorAll("ul").length !== 0)
		{
			// There are sub-options
			if (!subOptionsActive(element))
			{
				// Sub options should be disabled.
				setSubOptionsDisabled(element, true);
			}
			element.addEventListener("change", function ()
				{
					if (!subOptionsActive(this))
					{
						setSubOptionsDisabled(this, true);
					}
					else
					{
						enableSubOptions(this);
					}
				}
			);
		}

		if (element.type == "text")
		{
			element.addEventListener("keyup",
				(event) =>
				{
					event.target.value = event.target.value.trim();
					saveOptions();
				}
			);
		}
		else
		{
			element.addEventListener("change", saveOptions);
		}
	}

	document.getElementById("enableAll").onclick = () => changeAll(true);
	document.getElementById("disableAll").onclick = () => changeAll(false);
}

function getOptions(firstLoad=false)
{
	chrome.storage.sync.get("options", function (data)
	{
		items = data.options
		if (Object.entries(data).length === 0 || Object.entries(items).length === 0)
		{
			saveOptions();
			return false;
		}
		options = items;
		for (option in options)
		{
			switch (typeof options[option])
			{
				case "boolean":
					document.getElementById(option).checked = options[option];
					break;
				case "string":
					document.getElementById(option).value = options[option];
					break;
			}
		}
		if (firstLoad)
			init();
	});
}

function saveOptions()
{
	const oldOptions = Object.assign({}, options);

	for (element of document.getElementsByClassName("option"))
	{
		if (element.type === "checkbox")
		{
			options[element.id] = element.checked;
		}
		else
		{
			options[element.id] = element.value;
		}
	}

	chrome.storage.sync.set({"options": options});

	if (JSON.stringify(oldOptions) !== JSON.stringify(options))
	{
		tabs.forEach(
			(id) => {
				chrome.tabs.sendMessage(id, {type: "optionsChanged"})
			}
		);
	}
}

function changeAll(checked)
{
	for (element of document.getElementsByClassName("option"))
	{
		if (element.type === "checkbox")
		{
			element.checked = checked;
		}

		if (element.parentNode.parentNode.parentNode.tagName == "LI")
			element.disabled = !checked;
	}
	// Doesn't trigger the change event so need to save manually.
	saveOptions();
}


window.onload = () =>
{
	chrome.runtime.sendMessage({type: "tabsRequest"},
		(response) => {
			tabs = response.openedTabs;
		}
	);

	getOptions(true);
}
