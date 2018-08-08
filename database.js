import Realm from 'realm';
import {AudioUtils} from 'react-native-audio';
var RNFS = require('react-native-fs');
import path from 'react-native-path';


export const VOICEMAIL_SCHEMA = "voiceMail";
export const USER_SCHEMA = "user";
// Define your models and their properties
export const VoiceMailSchema = {
    name: VOICEMAIL_SCHEMA,
    primaryKey: 'id',
    properties: {
        id: 'string',    // primary key
        path: 'string',
        checked: { type: 'bool', default: false },
        // creationDate: 'date',
        // todos: { type: 'list', objectType: TODO_SCHEMA },
    }
};
export const UserSchema = {
    name: USER_SCHEMA,
    // primaryKey: 'id',
    properties: {
        // id: 'int',    // primary key
        room: { type: 'string', default: "" },
        company: { type: 'string', default: "" },
    }
};
const databaseOptions = {
    // path: 'App.realm',
    schema: [VoiceMailSchema, UserSchema],
    schemaVersion: 0, //optional    
};
//functions for TodoLists
export const rememberUser = newUser => new Promise((resolve, reject) => {  
    Realm.open(databaseOptions).then(realm => {
        realm.write(() => {
            let user = realm.objects(USER_SCHEMA)[0];
            user.company = newUser.company;
            user.room = newUser.room;
            resolve(user);
        });
    }).catch((error) => {
        console.log("error: " + error);
        reject(error);
    });
});

export const checkIfLoggedIn = () => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {        
        let user = realm.objects(USER_SCHEMA);
        console.log("user[0]: ");
        console.log(user[0]);
        if(user[0].room!=""){
            resolve(true);  
        }
        else{
            resolve(false);  
        }
    }).catch((error) => {        
        reject(error);  
    });
});

export const getLoggedInUser = () => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {        
        let user = realm.objects(USER_SCHEMA);
        resolve(user[0]);  
    }).catch((error) => {        
        reject(error);  
    });
});

export const readyToLogin = () => new Promise((resolve, reject) => {   
    Realm.open(databaseOptions).then(realm => {
        let user = realm.objects(USER_SCHEMA);
        if(user.length == 0){
            realm.write(() => {
                realm.create(USER_SCHEMA, {});
            });
        }
        resolve();
    }).catch((error) => {reject(error)});
});

//functions for TodoLists
export const forgetUser = () => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {
        realm.write(() => {
            let user = realm.objects(USER_SCHEMA)[0];
            user.company = "";
            user.room = "";
            resolve(user);
        });
    }).catch((error) => reject(error));
});

//functions for VoiceMails
insertVoiceMail = voiceMail => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {
        realm.write(() => {
					console.log("voiceMail.id: ");
					console.log(voiceMail.id);
						let existing = realm.objectForPrimaryKey(VOICEMAIL_SCHEMA, voiceMail.id);
						console.log("existing: ");
						console.log(existing);
						if (!existing){
							console.log("not exist");
							realm.create(VOICEMAIL_SCHEMA, voiceMail);
							resolve(voiceMail);						
						}
						else{
							console.log("exist");
						}
        });
    }).catch((error) => {
			console.log("error: " + error);
			reject(error)
		});
});

export const insertVoiceMails = voiceMailsData => new Promise((resolve, reject) => { 
	var voiceMail = {};
	console.log("voiceMailsData: ");
	console.log(voiceMailsData);
	
	for (let key in voiceMailsData){
		RNFS.exists(path.dirname(AudioUtils.DocumentDirectoryPath + key)).then(exist => {
			if (!exist){
				console.log("mkdir: " + path.dirname(AudioUtils.DocumentDirectoryPath + key));
				// RNFS.mkdir(dirname);
				RNFS.mkdir(path.dirname(AudioUtils.DocumentDirectoryPath + key)).then(()=>{
					RNFS.writeFile(AudioUtils.DocumentDirectoryPath + key, voiceMailsData[key], 'base64');
				});
			}
			else{
				RNFS.writeFile(AudioUtils.DocumentDirectoryPath + key, voiceMailsData[key], 'base64');
			}
			voiceMail = {
				id: key,
				path: key,
			};
			insertVoiceMail(voiceMail);

			console.log("key: ");
			console.log(key);
			console.log("voiceMail.path: ");
			console.log(voiceMail.path);
			console.log('FILE WRITTEN!');
			insertVoiceMail(voiceMail);
			console.log('FILE Inserted!');
		}).catch(error => {
			console.log("mkdir error: " + error);
		});
		// ensureDirectoryExistence(AudioUtils.DocumentDirectoryPath + key).then( pass =>{
		// 	console.log("pass: " + pass);
		// 	RNFS.exists(path.dirname(AudioUtils.DocumentDirectoryPath + key)).then(exist => {
		// 		if (!exist){
		// 			console.log("directory not ready!");
		// 		}
		// 		else{
		// 			console.log("directory ready!");
		// 		}
		// 		Promise.resolve();
		// 	}).catch(error => {
		// 		console.log("error: " + error);
		// 	});
		// });
	}

	// writeVoiceMailFiles(voiceMailsData);

	// for (let key in voiceMailsData){
	// 	voiceMail = {
	// 		id: key,
	// 		path: key,
	// 	};
	// 	console.log("key: ");
	// 	console.log(key);
	// 	console.log("voiceMail.path: ");
	// 	console.log(voiceMail.path);
	// 	console.log('FILE WRITTEN!');
	// 	insertVoiceMail(voiceMail);
	// 	console.log('FILE Inserted!');
	// }
});

async function ensureDirectoryExistence(filePath) {
	var dirname = path.dirname(filePath);
	RNFS.exists(dirname).then(exist => {
		if (!exist){
			console.log("mkdir: " + dirname);
			// RNFS.mkdir(dirname);
			RNFS.mkdir(dirname).then(()=>{
				RNFS.exists(dirname).then(exist => {
					if (!exist){
						console.log("directory not ready!");
					}
					else{
						console.log("directory ready!");
					}
					Promise.resolve("pass");
				}).catch(error => {
					console.log("error: " + error);
				});
			});
		}
	}).catch(error => {
		console.log("mkdir error: " + error);
	});
}

function writeVoiceMailFiles(voiceMailsData){
  for (let key in voiceMailsData){
		RNFS.writeFile(AudioUtils.DocumentDirectoryPath + key, voiceMailsData[key], 'base64').then().catch(error => {
			console.log("error: " + error);
		});
  }
}

export const checkVoiceMail = voiceMailId => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {        
        realm.write(() => {
            let voiceMail = realm.objectForPrimaryKey(VOICEMAIL_SCHEMA, voiceMailId);   
            voiceMail.checked = true;    
            resolve();     
        });
    }).catch((error) => reject(error));
});

export const deleteVoiceMail = voiceMailId => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {        
        realm.write(() => {
            let deletingVoiceMail = realm.objectForPrimaryKey(VOICEMAIL_SCHEMA, voiceMailId);
            realm.delete(deletingVoiceMail);
            resolve();   
        });
    }).catch((error) => reject(error));
});
// export const deleteAllTodoLists = () => new Promise((resolve, reject) => {    
//     Realm.open(databaseOptions).then(realm => {        
//         realm.write(() => {
//             let allTodoLists = realm.objects(TODOLIST_SCHEMA);
//             for (var index in allTodoLists) {
//                 let eachTodoList = allTodoLists[index]
//                 realm.delete(eachTodoList.todos);
//             }
//             realm.delete(allTodoLists);
//             resolve();
//         });
//     }).catch((error) => reject(error));
// });
export const queryAllVoiceMails = () => new Promise((resolve, reject) => {    
    Realm.open(databaseOptions).then(realm => {        
        let allVoiceMails = realm.objects(VOICEMAIL_SCHEMA);
        resolve(allVoiceMails);  
    }).catch((error) => {        
        reject(error);  
    });
});
// export const filterTodoLists = (searchedText) => new Promise((resolve, reject) => {
//     Realm.open(databaseOptions).then(realm => {
//         let filteredTodoLists = realm.objects(TODOLIST_SCHEMA)
//                                 .filtered(`name CONTAINS[c] "${searchedText}"`);//[c] = case insensitive
//         resolve(filteredTodoLists);
//     }).catch((error) => {
//         reject(error);
//     });
// });
//Add array of Todos to an existing TodoList
// export const insertTodos2TodoList = (todoListId, newTodos) => new Promise((resolve, reject) => {
//     Realm.open(databaseOptions).then(realm => {
//         let todoList = realm.objectForPrimaryKey(TODOLIST_SCHEMA, todoListId);
//         realm.write(() => {         
//             console.log("todoList.todos:");                                                    
//             console.log(todoList.todos);                                                    
//             for (var index in newTodos) {
//                 todoList.todos.push(newTodos[index]);   
//                 console.log("todoList.todos:");                                                    
//                 console.log(todoList.todos);             
//             }
//             resolve(newTodos);
//         });
//     }).catch((error) => {
//         reject(error);
//     });
// });
// //Get todos from TodoList's Id
// export const getTodosFromTodoListId = (todoListId) => new Promise((resolve, reject) => {
//     Realm.open(databaseOptions).then(realm => {
//         let todoList = realm.objectForPrimaryKey(TODOLIST_SCHEMA, todoListId);
//         resolve(todoList.todos);
//     }).catch((error) => {
//         reject(error);
//     });
// });
export default new Realm(databaseOptions);