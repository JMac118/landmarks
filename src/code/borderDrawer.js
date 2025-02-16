import landmarkName from './landmarkName'
import { defaultBorderSettings } from './defaults'

export default function BorderDrawer(win, doc, contrastChecker) {
	const borderWidthPx = 4

	const borderedElements = new Map()
	let borderColour = defaultBorderSettings.borderColour      // cached locally
	let borderFontSize = defaultBorderSettings.borderFontSize  // cached locally
	let labelFontColour = null  // computed based on border colour
	let madeDOMChanges = false


	//
	// Window resize handling
	//

	function resizeHandler() {
		for (const [element, related] of borderedElements) {
			if (doc.body.contains(element)) {
				sizeBorderAndLabel(element, related.border, related.label)
			} else {
				removeBorderAndDelete(element)
			}
		}
	}

	win.addEventListener('resize', resizeHandler)


	//
	// Options handling
	//

	// Take a local copy of relevant options at the start (this means that
	// 'gets' of options don't need to be done asynchronously in the rest of
	// the code). This also computes the initial label font colour (as it
	// depends on the border colour, which forms the label's background).
	browser.storage.sync.get(defaultBorderSettings, function(items) {
		borderColour = items['borderColour']
		borderFontSize = items['borderFontSize']
		updateLabelFontColour()
	})

	browser.storage.onChanged.addListener(function(changes) {
		let needUpdate = false
		if ('borderColour' in changes) {
			borderColour = changes.borderColour.newValue
			needUpdate = true
		}
		if ('borderFontSize' in changes) {
			borderFontSize = changes.borderFontSize.newValue
			needUpdate = true
		}
		if (needUpdate) {
			updateLabelFontColour()
			redrawBordersAndLabels()
		}
	})


	//
	// Public API
	//

	// Add the landmark border and label for an element. Takes an element info
	// object, as returned by the various LandmarksFinder functions.
	//
	// Note: we assume that if an element already exists and we try to add it
	//       again (as may happen if the page changes whilst we're displaying
	//       all elements, and try to add any new ones) that the existing
	//       elements' labels won't have changed.
	this.addBorder = function(elementInfo) {
		if (!borderedElements.has(elementInfo.element)) {
			drawBorderAndLabel(
				elementInfo.element,
				landmarkName(elementInfo),
				borderColour,
				labelFontColour,  // computed as a result of settings
				borderFontSize,
				elementInfo.guessed)
		}
	}

	// Add the landmark border and label for several elements, and remove any
	// borders associated with elements that currently have borders but aren't
	// in this set. Takes an array of element info objects, as detailed above.
	this.replaceCurrentBordersWithElements = function(elementInfoList) {
		const elementsToAdd = elementInfoList.map(info => info.element)

		for (const elementWithBorder of borderedElements.keys()) {
			if (!elementsToAdd.includes(elementWithBorder)) {
				this.removeBorderOn(elementWithBorder)
			}
		}

		for (const elementInfo of elementInfoList) {
			this.addBorder(elementInfo)
		}
	}

	this.removeBorderOn = function(element) {
		if (borderedElements.has(element)) {
			removeBorderAndDelete(element)
		}
	}

	this.removeAllBorders = function() {
		for (const element of borderedElements.keys()) {
			removeBorderAndDelete(element)
		}
	}

	// Did we just make changes to a border? If so, report this, so that the
	// mutation observer can ignore it.
	this.hasMadeDOMChanges = function() {
		const didChanges = madeDOMChanges
		madeDOMChanges = false
		return didChanges
	}

	// In case it's detected that an element may've moved due to mutations
	this.refreshBorders = function() {
		resizeHandler()
	}


	//
	// Private API
	//

	// Create an element on the page to act as a border for the element to be
	// highlighted, and a label for it; position and style them appropriately
	function drawBorderAndLabel(
		element, label, colour, fontColour, fontSize, guessed) {
		const zIndex = 10000000

		const labelContent = doc.createTextNode(label)

		const borderDiv = doc.createElement('div')
		const style = guessed ? 'dashed' : 'solid'
		borderDiv.style.border = borderWidthPx + 'px ' + style + ' ' + colour
		borderDiv.style.boxSizing = 'border-box'
		borderDiv.style.margin = '0'
		borderDiv.style.padding = '0'
		// Pass events through - https://stackoverflow.com/a/6441884/1485308
		borderDiv.style.pointerEvents = 'none'
		borderDiv.style.position = 'absolute'
		borderDiv.style.zIndex = zIndex

		const labelDiv = doc.createElement('div')
		labelDiv.style.backgroundColor = colour
		labelDiv.style.border = 'none'
		labelDiv.style.boxSizing = 'border-box'
		labelDiv.style.color = fontColour
		labelDiv.style.display = 'inline-block'
		labelDiv.style.fontFamily = 'sans-serif'
		labelDiv.style.fontSize = fontSize + 'px'
		labelDiv.style.fontWeight = 'bold'
		labelDiv.style.margin = '0'
		labelDiv.style.paddingBottom = '0.25em'
		labelDiv.style.paddingLeft = '0.75em'
		labelDiv.style.paddingRight = '0.75em'
		labelDiv.style.paddingTop = '0.25em'
		labelDiv.style.position = 'absolute'
		labelDiv.style.whiteSpace = 'nowrap'
		labelDiv.style.zIndex = zIndex

		labelDiv.appendChild(labelContent)

		doc.body.appendChild(borderDiv)
		doc.body.appendChild(labelDiv)
		madeDOMChanges = true  // seems to be covered by sizeBorderAndLabel()
		sizeBorderAndLabel(element, borderDiv, labelDiv)

		borderedElements.set(element, {
			'border': borderDiv,
			'label': labelDiv,
			'guessed': guessed
		})
	}

	// Given an element on the page and elements acting as the border and
	// label, size the border, and position the label, appropriately for the
	// element
	function sizeBorderAndLabel(element, border, label) {
		const elementBounds = element.getBoundingClientRect()
		const elementTopEdgeStyle = win.scrollY + elementBounds.top + 'px'
		const elementLeftEdgeStyle = win.scrollX + elementBounds.left + 'px'
		const elementRightEdgeStyle = doc.documentElement.clientWidth -
			(win.scrollX + elementBounds.right) + 'px'

		border.style.left = elementLeftEdgeStyle
		border.style.top = elementTopEdgeStyle
		border.style.width = elementBounds.width + 'px'
		border.style.height = elementBounds.height + 'px'

		// Try aligning the right edge of the label to the right edge of the
		// border.
		//
		// If the label would go off-screen left, align the left edge of the
		// label to the left edge of the border.

		label.style.removeProperty('left')  // in case this was set before

		label.style.top = elementTopEdgeStyle
		label.style.right = elementRightEdgeStyle

		// Is part of the label off-screen?
		const labelBounds = label.getBoundingClientRect()
		if (labelBounds.left < 0) {
			label.style.removeProperty('right')
			label.style.left = elementLeftEdgeStyle
		}

		madeDOMChanges = true  // seems to be in the right place
	}

	function removeBorderAndDelete(element) {
		removeBorderAndLabelFor(element)
		borderedElements.delete(element)
	}

	// Remove known-existing DOM nodes for the border and label
	// Note: does not remove the record of the element, so as to avoid an
	//       infinite loop when redrawing borders.
	//       TODO fix this with .keys()?
	function removeBorderAndLabelFor(element) {
		const related = borderedElements.get(element)
		related.border.remove()
		related.label.remove()
		madeDOMChanges = true
	}

	// Work out if the label font colour should be black or white
	function updateLabelFontColour() {
		labelFontColour = contrastChecker.foregroundTextColour(
			borderColour,
			borderFontSize,
			true)  // the font is always bold
	}

	function redrawBordersAndLabels() {
		for (const [element, related] of borderedElements) {
			const labelText = related.label.innerText
			removeBorderAndLabelFor(element)
			drawBorderAndLabel(
				element,
				labelText,
				borderColour,
				labelFontColour,  // computed as a result of settings
				borderFontSize,
				related.guessed)
		}
	}
}
