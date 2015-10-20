#!/usr/local/bin/node

// var db = require("../lib/db.js")
// var util = require("../lib/util.js")
// var async = require("async")
// var fs = require("fs")
// require("string_score");

var cluster = require('cluster');


if (cluster.isMaster) {



	var db = require("../lib/db.js")

	var queue = {}

	var countTotal = 0, countTotalFast = 0, countTotalLocal = 0, countBibRecords = 0

	//empty out the FAST terms table that we build for later use
	// db.returnRegistryDb(function(err, databaseRegistry){
	// 	var termsSameAsCollection = databaseRegistry.collection('termsSameAs')
	// 	termsSameAsCollection.drop(function(err,results){
	// 		databaseRegistry.close()
	// 	})
	// })


	//maintain a queue of work for the workers to get through
	db.allBibs(function(bib,cursor,mongoConnection){


		if (!bib){
			console.log("End of bib records reached.")
			return false
		}

		if (bib['sc:terms']){
			//it already has the terms done
			countBibRecords++
			process.stdout.clearLine()
			process.stdout.cursorTo(0)			
			process.stdout.write("Terms | countBibRecords: " + countBibRecords + " countTotal: " + countTotal + " countTotalFast: " + countTotalFast + " countTotalLocal: " + countTotalLocal )

			cursor.resume()
			return false
		}
		

		queue[bib._id] = { bib: bib, working: false }

		//are there enough in the queue?
		if (Object.keys(queue).length < 10000){
			cursor.resume()
		}else{

			setTimeout(function(){
				cursor.resume()
			},10000)


		}

	})


	//the worker function
	var buildWorker = function(){

		var worker = cluster.fork();

		worker.on('message', function(msg) {
			if (msg.req) {
				//they are asking for new work
				for (var x in queue){
					if (!queue[x].working){
						queue[x].working = true
						worker.send({ req: queue[x].bib })
						return true
						break;
					}
				}
				console.log("Nothing letf to work in the queue!")

				worker.send({ sleep: true })
			}
			if (msg.res) {

				countBibRecords++
				countTotal = countTotal + (msg.fastCount + msg.localCount)
				countTotalFast = countTotalFast + msg.fastCount
				countTotalLocal = countTotalLocal + msg.localCount

				process.stdout.clearLine()
				process.stdout.cursorTo(0)
				process.stdout.write("Terms | countBibRecords: " + countBibRecords + " countTotal: " + countTotal + " countTotalFast: " + countTotalFast + " countTotalLocal: " + countTotalLocal + " last: " + msg.res)

				

				//they are done with this record, delete it from the queue
				delete queue[msg.res]
			}
		})

		worker.on('exit', function(code, signal) {



			console.log("WORKER#: ", worker.id)
			if( signal ) {
				console.log("worker was killed by signal: "+signal)
			} else if( code !== 0 ) {
				console.log("worker exited with error code: "+code)
				buildWorker()
			} else {
				console.log("worker success!")
			}


		})



	}



	var check = setInterval(function(){

		if (Object.keys(queue).length > 1000){

			clearTimeout(check)

			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()
			buildWorker()

		}else{
			console.log("Nothing in queue yet.")
		}


	},10000)







}else{


	var db = require("../lib/db.js")
	var util = require("../lib/util.js")
	var async = require("async")
	//var fs = require("fs")
	//require("string_score");

	console.log('Worker #', cluster.worker.id, " starting up.")


	db.returnRegistryDb(function(err, databaseRegistry){

		db.returnShadowcatDb(function(err, databaseShadowcat){

			var termsSameAs = databaseRegistry.collection('termsSameAs') 
			var fastLookup = databaseRegistry.collection('fastLookup') 
			var viafLookup = databaseRegistry.collection('viafLookup') 


			var processRecord = function(msg) {

				if (msg.sleep){

					console.log('Worker #',cluster.worker.id," No work! Going to sleep for 300 sec ")

					setTimeout(function(){process.send({ req: true });},300000)
				

					return true
				}


				if (msg.req){

					var finalTerms = []

					//this is the new record
					var bib = msg.req



					//console.log('Worker #',cluster.worker.id," working on ", bib._id)

					//work..	
					var terms = util.returnTerms(bib)


					//we need to check against FAST if any of these terms that don't have FAST ids match anything
					async.each(terms, function(term, eachCallback) {


						//find if this one exists

						//var normal = util.normalizeAndDiacritics(name.name)

						// if (term.nameLocal === false){
						// 	console.log(term)
						// }



						// if (term.nameLocal && term.nameFast){
						// 	//if they are not the same we are intrested in what is being mapped from local to FAST and 
						// 	//if that that can be used globally
						// 	if (util.singularize(util.normalizeAndDiacritics(term.nameLocal)) != util.singularize(util.normalizeAndDiacritics(term.nameFast))){
						// 		//throw this into the database for later use
						// 		termsSameAs.insert({ fast: term.fast, nameLocal:term.nameLocal, nameFast: term.nameFast  },function(err,result){
						// 			if (err) console.log(err)
						// 		})
						// 	}
						// }

						//if it has a FAST id  we need to make sure:

						if (term.fast){

							//make sure it is not in VIAF
							viafLookup.find({ fast : term.fast }).toArray(function(err, viafAry) {

								if (viafAry.length>0){

									//it is in VIAF , so it is name, do not add it in as a term for this bib									
									eachCallback()

								}else{


									//it is not in viaf, so it is legit, if it does not have a type then we need to get that
									if (!term.type){

										
										fastLookup.find({ _id : term.fast }).toArray(function(err, fastAry) {

											if (fastAry.length>0){
												if (fastAry[0].type) term.type = fastAry[0].type
											}

											//hopefully that worked, add it to the final
											finalTerms.push(term)
											eachCallback()
										})

										

									}else{


										//everything is all set, add it into the final list
										finalTerms.push(term)
										eachCallback()

									}						

								}


							})


							

						}else{

							//it is a local term, see if for some reason it lives in the FAST lookup table normalized
							var normal = util.singularize(util.normalizeAndDiacritics(term.nameLocal))

							fastLookup.find({ normalized : normal }).toArray(function(err, fastAry) {

								if (fastAry.length>0){
									
									//it found something, add in the data
									if (fastAry[0].prefLabel) term.nameFast = fastAry[0].prefLabel
									if (fastAry[0]._id) term.fast = fastAry[0]._id	
									if (fastAry[0].type) term.type = fastAry[0].type	

								}

								//add it into the final ary
								finalTerms.push(term)

								eachCallback()
							})

						}

						

					//fires when all the lookups are done		

					}, function(err){



						var fastCount = 0, localCount = 0
						finalTerms.map(function(t){

							if (t.fast){ fastCount++; }else{ localCount++ }

						})


						//update the bib record
						var update = {
							id : bib._id,
							'sc:terms' : finalTerms
						}


						db.updateBibRecord(update,function(){

							process.send({ res: bib._id, fastCount: fastCount, localCount: localCount });

							//ask for a new one
							process.send({ req: true });
								


						},databaseShadowcat)




					})






				}



			}




			process.on('message', processRecord)

			process.send({ req: true });

		})

	})

}





// var countFoundInLC = 0
// var countFoundInViafViaOclc = 0
// var countLocal = 0
// var countAddedUnmatchedNames = 0
// var countTotalNames = 0
// var relatorsCodes = {}



// setInterval(function(){

// 	var r = {
// 		countTotalNames: countTotalNames,
// 		countFoundInLC: countFoundInLC,
// 		countFoundInViafViaOclc: countFoundInViafViaOclc,
// 		countLocal: countLocal,
// 		countAddedUnmatchedNames: countAddedUnmatchedNames,
// 		relatorsCodes: relatorsCodes,
// 	}

// 	fs.writeFile(__dirname + '/../log/agent_results.json', JSON.stringify(r,null,4), function (err) {

// 		if (err) console.log(err)

// 	})

// },30000)

// db.returnViafLookup(function(err,viafLookup){



// 	db.allBibs(function(bib,cursor,mongoConnection){

// 		process.stdout.clearLine()
// 		process.stdout.cursorTo(0)
// 		process.stdout.write( counter + " | " +  "countTotalNames: " + countTotalNames + " countFoundInLC: " + countFoundInLC + " countFoundInViafViaOclc: " + countFoundInViafViaOclc + " countLocal: " + countLocal + " countAddedUnmatchedNames: " + countAddedUnmatchedNames )

// 		counter++

// 		var names = []

			
		
// 		//build all the agents

// 		if (bib.varFields){



// 			for (var field in bib.varFields){


// 				field = bib.varFields[field]
// 				//100, 110, 111
// 				//700, 710, 711

// 				if (field.marcTag){
// 					if (checkFields.indexOf(field.marcTag) > -1){

// 						var name = "", relator = false

// 						if (field.subfields){

// 							for (var subfield in field.subfields){

// 								subfield = field.subfields[subfield]

// 								if (subfield.tag){
// 									if (namePartSubcode.indexOf(subfield.tag) > -1){
// 										if (subfield.content){
// 											name = name + " " + subfield.content
// 										}
// 									}

// 									if (subfield.tag == 'e' || subfield.tag == '4'){
// 										if (subfield.content){
// 											relator = subfield.content
// 										}
// 									}
// 								}

								



// 							}


// 						}

// 						name = name.trim()

// 						if (name != ""){
// 							if (field.marcTag != '600' && field.marcTag != '610' && field.marcTag != '611'){
// 								names.push( { name: name, relator:relator, contributor : true } )
// 							}else{
// 								names.push( { name: name, relator:relator, contributor : false } )


// 							}
// 						}
						 






// 					}

// 				}





// 			}


// 		}







// 		var newNames = []

// 		async.each(names, function(name, eachCallback) {


// 			//find if this one exists

// 			var normal = util.normalizeAndDiacritics(name.name)




// 			viafLookup.find({ $or :[ {normalized : normal}, {normalized : normal+' '} ]}).toArray(function(err, viafAry) {

// 				if (viafAry.length>0){

// 					// console.log(name.name,bib._id)
// 					// console.log(viafAry[0])

// 					name.viafName = viafAry[0].prefLabel
// 					name.viafId = viafAry[0]._id


// 				}else if (viafAry.length==0){

// 					//console.log("No match ------ ",bib._id)
// 					//console.log(name)					
// 					name.viafId = false




// 				}


// 				newNames.push(name)
// 				eachCallback()	

// 			})
		

// 		//fires when all the lookups are done		

// 		}, function(err){
// 		   	if (err) console.log(err)


// 		   	var checkOclc = false
// 		   	newNames.map(function(name){if (!name.viafId) checkOclc = true})

// 		   	if (checkOclc){

		   		


// 		   		//lets gather all of our viaf IDS and their labels
// 		   		var viafIds = [], viafNameLookup = {}

// 		   		if (bib['classify:creatorVIAF']){
// 		   			bib['classify:creatorVIAF'].map(function(v){ if (viafIds.indexOf(v)==-1){ viafIds.push(v); if (!viafNameLookup[v]) viafNameLookup[v] = { nameLc: "", nameViaf: "", contributor: true } }  })
// 		   		}

// 		   		if (bib['wc:contributor']){
// 		   			bib['wc:contributor'].map(
// 		   				function(v){ 

// 			   				if (viafIds.indexOf(v.id)==-1){
// 			   					viafIds.push(v.id)		   					
// 			   					if (!viafNameLookup[v.id])
// 			   						viafNameLookup[v.id] = { nameLc: "", nameViaf: v.name, contributor: true }
// 			   				}

// 		   					//make sure it has the name 
// 		   					if (v.name != "" && viafNameLookup[v.id].nameViaf == "") viafNameLookup[v.id].nameViaf = v.name
// 		   				})
// 		   		}

// 		   		if (bib['wc:creator']){

// 		   			bib['wc:creator'].map(
// 		   				function(v){ 
		   					
// 			   				if (viafIds.indexOf(v.id)==-1){
// 			   					viafIds.push(v.id)		   					
// 			   					if (!viafNameLookup[v.id])
// 			   						viafNameLookup[v.id] = { nameLc: "", nameViaf: v.name, contributor: true  }
// 			   				}

// 		   					//make sure it has the name 

// 		   					if (v.name != "" && viafNameLookup[v.id].nameViaf == "") viafNameLookup[v.id].nameViaf = v.name
// 		   				})
// 		   		}

// 		   		if (bib['wc:aboutViaf']){

// 		   			bib['wc:aboutViaf'].map(
// 		   				function(v){ 
		   					
// 			   				if (viafIds.indexOf(v.id)==-1){
// 			   					viafIds.push(v.id)		   					
// 			   					if (!viafNameLookup[v.id])
// 			   						viafNameLookup[v.id] = { nameLc: "", nameViaf: v.name, contributor: false }
// 			   				}

// 		   					//make sure it has the name 

// 		   					if (v.name != "" && viafNameLookup[v.id].nameViaf == "") viafNameLookup[v.id].nameViaf = v.name


// 		   				})
// 		   		}


// 		   		//create a jank alt name from any viaf natural lanuage one


// 		   		for (var x in viafNameLookup){

// 		   			if (viafNameLookup[x].nameViaf){

// 		   				var parts = human.parseName(viafNameLookup[x].nameViaf);

// 		   				if (parts.firstName && parts.lastName){

// 		   					viafNameLookup[x].nameViafAlt = ""
// 		   					viafNameLookup[x].nameViafAlt = viafNameLookup[x].nameViafAlt + parts.lastName 
// 		   					if (parts.suffix) viafNameLookup[x].nameViafAlt = viafNameLookup[x].nameViafAlt + " " + parts.suffix

// 		   					viafNameLookup[x].nameViafAlt = viafNameLookup[x].nameViafAlt + ", " + parts.firstName + " "
// 		   					if (parts.middleName) viafNameLookup[x].nameViafAlt = viafNameLookup[x].nameViafAlt + " " + parts.middleName
// 		   					viafNameLookup[x].nameViafAlt = viafNameLookup[x].nameViafAlt.trim()
// 		   				}
		   				

// 		   			}

// 		   		}




// 		   		//now grab the possible records for all these viafs


// 				viafLookup.find({ _id : {$in : viafIds } }).toArray(function(err, viafAry) {

// 					//loop through and fill out any data



// 					viafAry.map(function(v){
// 						if (viafNameLookup[v._id]) viafNameLookup[v._id].nameLc = v.prefLabel
// 					})

// 					//remove any matches we know of already
// 					// newNames.map(function(n){
// 					// 	if (n.viafId){
// 					// 		delete viafLookup[n.viafId]
// 					// 	}
// 					// })

// 					//the idea is to try and match local names to worldcat names at an increasingly higher threashold
// 					//until there are no duplicate VIAF identfiers among the agents

// 					var ogNewNames = JSON.parse(JSON.stringify(newNames))
// 					var hasDupe = true, threshold = 0, dupeCheckCount = 0

// 					while (hasDupe === true && dupeCheckCount < 11){

// 						threshold = threshold + 0.1
// 						dupeCheckCount++
// 						hasDupe=false


// 						newNames = JSON.parse(JSON.stringify(ogNewNames))

// 						//now try to match anything left with the viaf entries
// 						newNames.map(function(n){
// 							if (!n.viafId){			

// 								var bestMatch = false, bestScore = -100;				
// 								for (var x in viafNameLookup){

// 									//all we really care about is if this possibly local name is represented somehow in the 
// 									//data from world cat or classify
									
// 									var scoreLc = 0, scoreViaf = 0, scoreViafAlt = 0

// 									if (viafNameLookup[x].nameLc) scoreLc = n.name.score(viafNameLookup[x].nameLc,0.5)
// 									if (viafNameLookup[x].nameViaf) scoreViaf = n.name.score(viafNameLookup[x].nameViaf,0.5)
// 									if (viafNameLookup[x].nameViafAlt) scoreViafAlt = n.name.score(viafNameLookup[x].nameViafAlt,0.5)

// 									if ( scoreLc > threshold || scoreViaf > threshold || scoreViafAlt > threshold){		


// 										var newScore = (scoreLc >= scoreViaf) ? scoreLc : scoreViaf
// 										if (scoreViafAlt > newScore) newScore = scoreViafAlt

// 										//console.log(n.name, " | ", viafNameLookup[x].nameLc, " > ",scoreLc)
// 										if (newScore>bestScore) bestMatch = x
// 									}
// 								}

// 								if (bestMatch){
// 									for (var y in newNames){
// 										if (newNames[y].name==n.name){
// 											newNames[y].matchedViaf = parseInt(bestMatch)
// 											//console.log('---------',bib._id)
// 											//console.log(newNames[y].name, " === ", viafNameLookup[bestMatch])	

// 										}								
																				
// 									}

// 								}



// 							}


// 						})

// 						var dupeCheck = {}

// 						newNames.map(function(n){

// 							if (n.matchedViaf){
// 								if (dupeCheck[n.matchedViaf+n.relator.toString()]){
// 									hasDupe=true
// 								}else{
// 									dupeCheck[n.matchedViaf+n.relator.toString()] = true
// 								}
// 							}
// 						})

// 					}		
	

// 					if (hasDupe){
// 						console.log("\n\nRecord still contains dupes:",bib._id,"\n\n")
// 					}




// 			  		//lets make a list of all the viaf that we did find
// 			  		var empolyedViaf = []

// 			  		newNames.map(function(n){
// 			  			if (n.viafId) if (empolyedViaf.indexOf(parseInt(n.viafId)) == -1) empolyedViaf.push(parseInt(n.viafId))
// 			  			if (n.matchedViaf) if (empolyedViaf.indexOf(parseInt(n.matchedViaf)) == -1) empolyedViaf.push(parseInt(n.matchedViaf))
// 			  		})
// 			  		var unusedViaf = []

// 			  		viafIds.map(function(n){
// 			  			if (empolyedViaf.indexOf(n)==-1) unusedViaf.push(n)
// 			  		})

// 			  		if (unusedViaf.length!=0){



// 			  			//console.log("Did not match local to anything:")
// 			  			// newNames.map(function(n){
// 			  			// 	if (!n.viafId && !n.matchedViaf) console.log("\t",n.name)
// 			  			// })

// 			  			// //console.log("Did not find local name for viaf:")

// 			  			// unusedViaf.map(function(n){
// 			  			// 	console.log("\t",n,viafNameLookup[n])
// 			  			// })


// 				  		if (newNames.length == 1 && unusedViaf.length == 1){


// 				  			for (var y in newNames){
// 				  				if (!newNames[y].matchedViaf && !newNames[y].viafId){
// 				  					newNames[y].matchedViaf = unusedViaf[0]
// 				  					unusedViaf = []
// 				  				}
// 				  			}

				  			
// 				  		}


// 				  	}

// 					// console.log(newNames)
// 			  //  		console.log(viafIds)
// 			  //  		console.log(viafNameLookup)
// 			  //  		console.log(unusedViaf)
			   		


// 			   		//at this point everything that we can map is mapped, build the final agents field
// 			   		var agents = []

// 			   		newNames.map(function(n){

// 			   			var a = {}

// 			   			a.nameLocal = n.name
// 			   			a.relator = n.relator
// 			   			a.contributor = n.contributor

// 			   			if (n.relator){
// 			   				if (relatorsCodes[n.relator]){
// 			   					relatorsCodes[n.relator]++
// 			   				}else{
// 			   					relatorsCodes[n.relator] = 1
// 			   				}
// 			   			}

// 			   			countTotalNames++

// 			   			//did we match it to viaf ourselves?
// 			   			if (n.viafId){
// 			   				//yes
// 			   				a.nameLc = (viafNameLookup[n.viafId]) ? viafNameLookup[n.viafId].nameLc : false
// 			   				a.nameViaf = (viafNameLookup[n.viafId]) ? viafNameLookup[n.viafId].nameViaf : false
// 			   				a.viaf = n.viafId

// 			   				countFoundInLC++

// 			   			}else if (n.matchedViaf){
// 			   				// with help from worldcat or classify
// 			   				a.nameLc = (viafNameLookup[n.matchedViaf]) ? viafNameLookup[n.matchedViaf].nameLc : false
// 			   				a.nameViaf = (viafNameLookup[n.matchedViaf]) ? viafNameLookup[n.matchedViaf].nameViaf : false
// 			   				a.viaf = n.matchedViaf

// 			   				countFoundInViafViaOclc++

// 			   			}else{
// 			   				//we did not match it at all
// 			   				a.nameLc = false
// 			   				a.nameViaf = false
// 			   				a.viaf = false
// 			   				countLocal++
// 			   			}

// 			   			if (a.nameLc  === '') a.nameLc = false
// 			   			if (a.nameViaf  === '') a.nameViaf = false

// 			   			agents.push(a)



// 			   		})


// 			   		//now we need to take care of any un matched viaf results
// 			   		unusedViaf.map(function(v){

// 			   			if (viafNameLookup[v]){
// 			   				n = viafNameLookup[v]

// 			   				countTotalNames++

// 				   			var a = {}

// 				   			a.nameLocal = false
// 				   			a.relator = false
// 				   			a.contributor = n.contributor
// 			   				a.nameLc = n.nameLc
// 			   				a.nameViaf = n.nameViaf

// 			   				a.viaf = v

// 				   			if (a.nameLc  === '') a.nameLc = false
// 				   			if (a.nameViaf  === '') a.nameViaf = false
// 				   			countAddedUnmatchedNames++

// 			   				agents.push(a)

// 			   			}



// 			   		})

// 			   		var update = {
// 			   			id : bib._id,
// 			   			'sc:agents' : agents
// 			   		}

// 			   		db.updateBibRecord(update,function(){


// 			   			cursor.resume()


// 			   		},mongoConnection)




					


// 				})



		   		

// 		   	}else{


		   		

// 		   		var agents = []

// 		   		newNames.map(function(n){

// 		   			countTotalNames++

// 		   			var a = {}

// 		   			a.nameLocal = n.name
// 		   			a.relator = n.relator
// 		   			a.contributor = n.contributor

// 		   			if (n.relator){
// 		   				if (relatorsCodes[n.relator]){
// 		   					relatorsCodes[n.relator]++
// 		   				}else{
// 		   					relatorsCodes[n.relator] = 1
// 		   				}
// 		   			}

// 		   			//did we match it to viaf ourselves?
// 		   			if (n.viafId){

// 		   				//yes
// 		   				a.nameLc = n.viafName
// 		   				a.nameViaf = false
// 		   				a.viaf = n.viafId

// 		   				countFoundInLC++

// 		   			}

// 		   			if (a.nameLc  === '') a.nameLc = false
// 		   			if (a.nameViaf  === '') a.nameViaf = false

// 		   			agents.push(a)



// 		   		})



// 		   		//console.log('\n\n\n---------',bib._id,bib['sc:oclc'],bib['classify:oclc'],bib['lc:oclc'])

// 		   		//console.log(agents)


// 		   		var update = {
// 		   			id : bib._id,
// 		   			'sc:agents' : agents
// 		   		}

// 		   		db.updateBibRecord(update,function(){

// 		   			cursor.resume()


// 		   		},mongoConnection)


// 		   	}
		   	
		   	

// 		})		


// 	})

// })