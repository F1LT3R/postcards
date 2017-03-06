#!/usr/bin/env node

const environment = 'test'
// const environment = 'live'

////////////////////////////////////////////////////////////////////////////////

const fs = require('fs')
const path = require('path')

const Promise = require('bluebird')
const program = require('commander')
const objectMerge = require('object-merge')
const jsonfile = require('jsonfile')
const chalk = require('chalk')
const Datauri = require('datauri')
const charm = require('promise-charm')

const packageJson = require('./package.json')
const apiKeys = require('./user/api-keys.json')
const addressList = require('./user/address-list.json')
const sender = require('./user/sender.json')

const lob = require('lob')
const Lob = lob(apiKeys[environment])

const Enquirer = require('enquirer')
const Question = require('prompt-question')
const Prompt = require('prompt-checkbox')
const enquirer = new Enquirer()
enquirer.register('question', require('prompt-question'));
enquirer.register('checkbox', require('prompt-checkbox'))

const error = err => {
	console.error('Error!')
	console.error(err)
}

const success = result => {
	console.log(result)
}

const generateAndSendPostcards = (addresses, link) => {
	const postcardDir = `./user/postcards/${link}`
	const frontImagePath = `${postcardDir}/front.jpg`
	const postcardData = require(`${postcardDir}/postcard.json`)
	const backHtmlPath = `${postcardDir}/back.html`
	const frontHtmlPath = `${postcardDir}/front.html`
	const signature = "- love Alistair, Amanda and Iona"

	const frontHtml = fs.readFileSync(frontHtmlPath, 'utf8')
	// const front = '<h1>HI!</h1>'
	const backHtml = fs.readFileSync(backHtmlPath, 'utf8')

	// console.log(frontImagePath)
	let promises = [];

	const datauri = new Datauri()

	datauri.on('encoded', content => {
		let front = frontHtml.replace('{{image}}', content)
		front = front.replace('{{date}}', new Date().toDateString())
		front = front.replace('{{title}}', postcardData.title)

		addresses.forEach(address => {
			const description = `${link} - ${address.name}`
			const totalGreeting = postcardData.greeting.replace(/\{\{name\}\}/g, address.description)
			const totalMessage = `${totalGreeting} ${postcardData.message} ${signature} `
			// process.exit()

			const cutPreSpace = text => {
				while (text[0] === ' ') {
					text = text.substr(1)
				}
				return text
			}

			const getNextWord = text => {
				const nextSpace = text.indexOf(' ')
				return text.substr(0, nextSpace)
			}

			const colWidth1 = 46
			const rowHeight1 = 6
			const colWidth2 = 19

			const chomp = text => {
				const rows = []

				let row = '';

				while (text.length > 0) {
					const nextWord = getNextWord(text)
					text = text.substr(nextWord.length + 1)
					text = cutPreSpace(text)

					if (rows.length < rowHeight1) {
						if (row.length + nextWord.length + 1 <= colWidth1) {
							row += nextWord + ' '
						} else if (row.length + nextWord.length + 1 > colWidth1) {
							rows.push(row)
							row = nextWord + ' '
						}
					} else {
						if (row.length + nextWord.length + 1 <= colWidth2) {
							row += nextWord + ' '
						} else if (row.length + nextWord.length + 1 > colWidth2) {
							rows.push(row)
							row = nextWord + ' '
						}

						if (text.length + row.length <= colWidth2) {
							row += text;
							rows.push(row)
							text = ''
						}
					}

				}

				return rows
			}

			const rows = chomp(totalMessage)

			// rows.forEach(row => {
			// 	console.log(`"${row}"`, row.length)
			// })
			// process.exit()

			const message2 = rows.join('<br>')
			let message3 = message2.replace(totalGreeting, `<b>${totalGreeting}</b>`)
			mesage3 = message3.replace(signature, `<b>${signature}</b>`)

			// console.log()
			// console.log(message3)
			// console.log()

			const from = sender
			const to = address

			// console.log(`Front image: ${content.substr(0, 100)}`)
			const back = backHtml.replace('{{message}}', message3)
			// console.log(`Back message: ${message3.substr(0, 100)}`)

			// console.log();
			// console.log(back)
			// process.exit();

			const postcard = {
				description,
				front,
				back,
				from: sender,
				to: to
			}
			// process.exit()

			// console.log(postcard)

			const makePromise = function (card, desc) {
				return new Promise(function (resolve, reject) {
					console.log(chalk.yellow(`Sending "${desc}"`))

					Lob.postcards.create(card, function (err, res) {
						if (err !== null) {
							console.error(chalk.red('FAILED: ' + desc))
							return reject(err)
						}

						console.log(chalk.green('SENT :' + desc))
						resolve(res)
					})
				})
			}

			promises.push(makePromise(postcard, description))

		})

		// Promise.all(promises)
		// .then(results => {
		// 	console.log(results)
		// })
		// .catch(err => {
		// 	console.error(err)

		charm(promises).then(results => {
			console.log(chalk.green('All postcards sent!'))
			results.forEach(result => {
				// console.log(result)
			})
		}).catch(err => {
			console.error(chalk.red(err))
		})
	})

	datauri.on('error', err => console.error(err));
	datauri.encode(frontImagePath);
}

const commands = {
	addressList: () => {
		Lob.addresses.list()
		.then(success)
		.catch(error)
	},

	addressDelete: id => {
		Lob.addresses.delete(id)
		.then(success)
		.catch(error)
	},

	addressAdd: index => {
		Lob.addresses.create(addressList[index])
		.then(success)
		.catch(error)
	},

	addSender: () => {
		Lob.addresses.create(sender)
		.then(success)
		.catch(error)
	},

	sendPostcard: link => {
		// Show addresses
		const prettyAddressList = addressList.map(address => {
			return `${address.name}`
		})

		const question = new Question('colors', 'Who are you sending this postcard to?', {
			type: 'checkbox',
			choices: prettyAddressList
		});

		const prompt = new Prompt(question)

		prompt.run()
		.then(answers => {
			const sendToList = [];

			addressList.forEach(address => {
				answers.forEach(answer => {
					if (address.name === answer) {
						sendToList.push(address)
					}
				})
			})

			generateAndSendPostcards(sendToList, link)
		})
		.catch(err => {
			console.log(err)
		})
	}
}

program
	.version(packageJson.version)
	.action((endpoint, command, ...params) => {
		const cmdName = endpoint +
			command[0].toUpperCase() +
			command.substr(1)

		if (Reflect.has(commands, cmdName)) {
			return commands[cmdName](...params)
		}

		console.error(`Command not found! "${endpoint} ${command}"`)
	})
	.parse(process.argv)