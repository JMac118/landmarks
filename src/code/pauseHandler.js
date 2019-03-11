export default function PauseHandler(pauseTimeHook) {
	//
	// Constants
	//

	const minPause = 500
	const maxPause = 60000
	const multiplier = 1.5
	const decrement = minPause
	const decreaseEvery = minPause * 2


	//
	// State
	//

	let pause = minPause
	let lastEvent = Date.now()
	let decreasePauseTimeout = null
	let haveIncreasedPauseAndScheduledTask = false
	pauseTimeHook(pause)


	//
	// Private API
	//

	function increasePause() {
		stopDecreasingPause()
		pause = Math.floor(pause * multiplier)
		if (pause >= maxPause) {
			pause = maxPause
		}
		console.log(`Increased pause to: ${pause}`)
		pauseTimeHook(pause)
	}

	function decreasePause() {
		decreasePauseTimeout = setTimeout(_decreasePause, decreaseEvery)
	}

	function _decreasePause() {
		pause = Math.floor(pause - decrement)
		if (pause <= minPause) {
			pause = minPause
			decreasePauseTimeout = null
		} else {
			decreasePause()
		}
		console.timeStamp(`Decreased pause to: ${pause}`)
		pauseTimeHook(pause)
	}

	function stopDecreasingPause() {
		if (decreasePauseTimeout) {
			clearTimeout(decreasePauseTimeout)
			decreasePauseTimeout = null
		}
	}


	//
	// Public API
	//

	// TODO would this be more efficient if tasks specified at init?
	this.run = function(ignoreCheck, guardedTask, scheduledTask) {
		if (ignoreCheck()) return

		const now = Date.now()
		if (now > lastEvent + pause) {
			console.log('Running guarded task')
			guardedTask()
			lastEvent = now
		} else if (!haveIncreasedPauseAndScheduledTask) {
			increasePause()
			console.timeStamp(`Scheduling task in: ${pause}`)
			setTimeout(() => {
				console.log('Running scheduled task')
				scheduledTask()
				decreasePause()
				haveIncreasedPauseAndScheduledTask = false
			}, pause)
			haveIncreasedPauseAndScheduledTask = true
		} else {
			console.log(`Already increased pause (${pause})`)
		}
	}

	this.getPauseTime = function() {
		return pause
	}
}
