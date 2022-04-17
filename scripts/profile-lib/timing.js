import puppeteer from 'puppeteer'
import stats from 'stats-lite'

import {
	load,
	pageSetUp,
	urls
} from './utils.js'

import {
	printAndSaveResults,
	wrapLandmarksFinder
} from './timingUtils.js'

import {
	elementCounts,
	landmarkNav,
	landmarkScan,
	mutationSetup,
	mutationTest
} from './timingBrowserFuncs.js'

const selectInteractives =
	'a[href], a[tabindex], button, div[tabindex], input, textarea'


//
// Getting landmarksFinder timings directly
//

// To avoid passing around loadsa args, we have an options object containing:
//   loops (int)           -- number of repeated scans and focusings
//   doScan (bool)         -- perform scanning test?
//   doFocus (bool)        -- perform focusing tests?
//   doMutations (bool)    -- perform mutation tests?
//   finderPath (string)   -- path to built script file
//   without (bool)        -- do NOT employ guessing in the Finder?
//   quietness (count)     -- how quiet should we be?
//   noFileWrite (bool)    -- do NOT write results to disk

export async function doTimeLandmarksFinding(sites, loops, doScan, doFocus, doMutations, without, quietness, noFileWrite) {
	const options = { loops, doScan, doFocus, doMutations }
	const finderPath = await wrapLandmarksFinder()
	const findersDevModes = { 'Standard': false, 'Developer': true }
	const fullResults = { 'meta': { 'loops': loops } }

	console.log(`Runing landmarks loop test on ${sites}...`)
	options.useHeuristics = true
	puppeteer.launch().then(async browser => {
		for (const finder in findersDevModes) {
			options.finderPath = finderPath
			options.useDevMode = findersDevModes[finder]
			console.log()
			console.log(`With scanner ${finder}...`)
			fullResults[finder] =
				await timeScannerOnSites(browser, sites, options, quietness)
			if (without) {
				options.useHeuristics = false
				const finderPrettyName = finder + ' (without heuristics)'
				console.log()
				console.log(`With scanner ${finderPrettyName}...`)
				fullResults[finderPrettyName] =
					await timeScannerOnSites(browser, sites, options, quietness)
			}
		}

		await browser.close()
		// NOTE: super-secret quietness level
		if (quietness < 3) printAndSaveResults(fullResults, !noFileWrite)
	})
}

async function timeScannerOnSites(browser, sites, options, quietness) {
	const finderResults = {}
	let totalElements = 0
	let totalInteractiveElements = 0
	let totalLandmarks = 0
	const allScanTimes = []
	const allNavForwardTimes = []
	const allNavBackTimes = []

	for (const site of sites) {
		const { siteResults, siteRawResults } =
			await runScansOnSite(browser, site, quietness, options)

		totalElements += siteResults.numElements
		totalInteractiveElements += siteResults.numInteractiveElements
		totalLandmarks += siteResults.numLandmarks

		if (options.doScan) {
			Array.prototype.push.apply(allScanTimes, siteRawResults.scanTimes)
		}

		if (options.doFocus) {
			Array.prototype.push.apply(
				allNavForwardTimes, siteRawResults.navForwardTimes)
			Array.prototype.push.apply(
				allNavBackTimes, siteRawResults.navBackTimes)
		}

		finderResults[site] = siteResults
	}

	if (sites.length > 1) {
		const combined = {}

		combined.numElements = totalElements
		combined.elementsPerPage = totalElements / sites.length
		combined.numInteractiveElements = totalInteractiveElements
		combined.interactiveElementsPercent =
			(totalInteractiveElements / totalElements) * 100
		combined.numLandmarks = totalLandmarks
		combined.LandmarksPerPage = totalLandmarks / sites.length

		if (options.doScan) {
			combined.scanMeanTimeMS = stats.mean(allScanTimes)
			combined.scanDeviation = stats.stdev(allScanTimes)
		}

		if (options.doFocus) {
			combined.navForwardMeanTimeMS = stats.mean(allNavForwardTimes)
			combined.navForwardDeviation = stats.stdev(allNavForwardTimes)
			combined.navBackMeanTimeMS = stats.mean(allNavBackTimes)
			combined.navBackDeviation = stats.stdev(allNavBackTimes)
		}

		finderResults['combined'] = combined
	}

	return finderResults
}

async function runScansOnSite(browser, site, quietness, {
	loops, finderPath, doScan, doFocus, doMutations, useHeuristics, useDevMode
}) {
	const page = await pageSetUp(browser, false, quietness)
	const results = { 'url': urls[site] }
	const rawResults = {}

	console.log()
	console.log(`Loading ${site}...`)
	await load(page, site)

	console.log('Injecting script...')
	await page.addScriptTag({ path: finderPath })

	console.log('Counting elements...')
	Object.assign(results, await page.evaluate(
		elementCounts, selectInteractives, useHeuristics))

	if (doScan) {
		console.log(`Running landmark-finding code ${loops} times...`)
		const scanTimes = await page.evaluate(
			landmarkScan, loops, useHeuristics, useDevMode)
		rawResults.scanTimes = scanTimes
		Object.assign(results, {
			'scanMeanTimeMS': stats.mean(scanTimes),
			'scanDeviation': stats.stdev(scanTimes)
		})
	}

	if (doFocus) {
		console.log(`Running forward-nav code ${loops} times...`)
		const navForwardTimes = await page.evaluate(landmarkNav,
			loops, 'forward', useHeuristics)
		rawResults.navForwardTimes = navForwardTimes
		Object.assign(results, {
			'navForwardMeanTimeMS': stats.mean(navForwardTimes),
			'navForwardDeviation': stats.stdev(navForwardTimes)
		})

		console.log(`Running Back-nav code ${loops} times...`)
		const navBackTimes = await page.evaluate(landmarkNav,
			loops, 'back', useHeuristics)
		rawResults.navBackTimes = navBackTimes
		Object.assign(results, {
			'navBackMeanTimeMS': stats.mean(navBackTimes),
			'navBackDeviation': stats.stdev(navBackTimes)
		})
	}

	if (doMutations) {
		console.log(`Running mutation tests ${loops} times...`)
		const result1 = await page.evaluate(mutationSetup, useHeuristics)
		const result2 = await page.evaluate(mutationTest, useHeuristics)
		console.log('mutation test result:', result1, result2)
	}

	await page.close()
	return { 'siteResults': results, 'siteRawResults': rawResults }
}
