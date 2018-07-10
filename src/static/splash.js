'use strict'
// FIXME localise (remember: table headings, button contents, ...)
// FIXME what to do when content script is re-loaded and disconnected in Blink

const chromeLike = window.chrome ? true : false

// The code below adds a rows for the commands to this
const tableRows = [
	{
		element: 'tr',
		contains: [
			{ element: 'th', content: 'Action' },
			{ element: 'th', content: 'Keyboard shortcut' }
		]
	}
]

const splashPage = {
	contains: [
		{ element: 'h1', content: 'Welcome to Landmarks' },
		{
			element: 'table',
			contains: tableRows
		}
	]
}

const chromeKeyboardShortcutsButton = {
	element: 'p', contains: [{
		element: 'button',
		content: 'Add or change shortcuts',
		listen: {
			event: 'click',
			handler: () => browser.runtime.sendMessage({
				request: 'splash-open-configure-shortcuts'
			})
		}
	}]
}


function makePart(structure, root) {
	let newPart

	for (const key in structure) {
		switch (key) {
			case 'element':
				newPart = document.createElement(structure[key])
				root.appendChild(newPart)
				break
			case 'class':
				newPart.classList.add(structure[key])
				break
			case 'text':
				root.appendChild(document.createTextNode(structure[key]))
				break
			case 'content':
				newPart.appendChild(document.createTextNode(structure[key]))
				break
			case 'listen':
				newPart.addEventListener(
					structure[key].event, structure[key].handler)
				break
			case 'contains':
				for (const contained of structure[key]) {
					makePart(contained, newPart ? newPart : root)
				}
				break
			default:
				throw Error(`Unexpected structure key ${key} encountered.`)
		}
	}

	return root
}


function splashFirst(parent, element) {
	parent.insertBefore(makePart(splashPage, element), parent.firstChild)
}


function addCommandRowAndReportIfMissing(command) {
	let missingShortcut = false

	// Work out the command's friendly name
	let action

	if (command.name === '_execute_browser_action') {
		action = 'Show pop-up'
	} else if (chromeLike) {
		// Chrome returns the full descriptions
		action = command.description
	} else {
		// Firefox requires the descriptions to be translated
		const messageName = command.description.slice(6, -2)
		action = browser.i18n.getMessage(messageName)
	}

	// Work out the command's shortcut
	let shortcutCellElement

	if (command.shortcut) {
		// Firefox gives "Alt+Shift+N" but Chrome gives ⌥⇧N
		if (chromeLike) {
			shortcutCellElement = { element: 'td', contains: [
				{ element: 'kbd', content: command.shortcut }
			]}
		} else {
			shortcutCellElement = { element: 'td', contains:
				firefoxShortcutElements(command.shortcut)
			}
		}
	} else {
		shortcutCellElement = { element: 'td', class: 'error', contains: [
			{ text: 'Not set up' }
		]}
		missingShortcut = true
	}

	tableRows.push({
		element: 'tr',
		contains: [
			{ element: 'td', content: action },
			shortcutCellElement
		]
	})

	return missingShortcut
}


function firefoxShortcutElements(shortcut) {
	const shortcutElements = []
	const shortcutParts = shortcut.split(/(\+)/)

	for (const keyOrPlus of shortcutParts) {
		if (keyOrPlus !== '+') {
			shortcutElements.push({ element: 'kbd', content: keyOrPlus })
		} else {
			shortcutElements.push({ text: ' + ' })
		}
	}

	return shortcutElements
}


browser.runtime.onMessage.addListener(function(message) {
	if (message.request !== 'splash-populate-commands') return

	// Chrome allows only four keyboard shortcuts to be specified in the
	// manifest; Firefox allows many.
	//
	// The extra ones for Firefox are patched in via its specific manifest file
	// when the manifest is merged.
	//
	// The commands are in the manifest in the opposite order to that which
	// seems most logical, and need to be reversed to pop out in the right
	// order on the splash page. This is because the merging in of the extra
	// keyboard shortcuts means that the commands with added keyboard shortucts
	// in Firefox are bumped to the top of the commands object.
	//
	// What is a bit odd is that, on Chrome, it appears the reversal is not
	// needed.
	const commandsInOrder = chromeLike ?
		message.commands : message.commands.reverse()

	let missingShortcuts = false

	for (const command of commandsInOrder) {
		missingShortcuts = addCommandRowAndReportIfMissing(command)
	}

	if (chromeLike) splashPage.contains.push(chromeKeyboardShortcutsButton)

	if (missingShortcuts) {
		splashPage.contains.push({ element: 'p', text: 'Missing shortcuts!' })
	}

	splashFirst(document.querySelector('main'), document.createElement('div'))
})


browser.runtime.sendMessage({
	request: 'get-commands'
})
