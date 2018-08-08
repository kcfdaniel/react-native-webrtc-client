import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  ListView,
  Button,
  Dimensions,
  StatusBar,
  Alert,
  Platform,
  PermissionsAndroid,
  FlatList,
} from 'react-native';
const { width, height } = Dimensions.get('window')
import io from 'socket.io-client';
import _ from 'lodash'
import DeviceInfo from 'react-native-device-info';
import path from 'react-native-path';
import Sound from 'react-native-sound';
import {AudioRecorder, AudioUtils} from 'react-native-audio';
var RNFS = require('react-native-fs');
import { rememberUser, checkIfLoggedIn, readyToLogin, getLoggedInUser, forgetUser, insertVoiceMails,
  deleteVoiceMail, queryAllVoiceMails, checkVoiceMail} from './database';
import realm from './database';
import Swipeout from 'react-native-swipeout';


const socket = io.connect('http://192.168.0.164:4443', {transports: ['websocket']});

import {
  RTCPeerConnection,
  RTCMediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStreamTrack,
  getUserMedia,
} from 'react-native-webrtc';

const configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};

let _this
let room = "";
let company = "";
let busy = false;
var users = {};
var pcPeers = {};
var voicemailsData = {};
let incallwith = "";

function getLocalStream(isFront, callback) {

  let videoSourceId;

  // on android, you don't have to specify sourceId manually, just use facingMode
  // uncomment it if you want to specify
  if (Platform.OS === 'ios') {
    MediaStreamTrack.getSources(sourceInfos => {
      console.log("sourceInfos: ", sourceInfos);

      for (const i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if(sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
          videoSourceId = sourceInfo.id;
        }
      }
    });
  }
  getUserMedia({
    audio: true,
    video: {
      mandatory: {
        minWidth: 640, // Provide your own width, height and frame rate here
        minHeight: 660,
        minFrameRate: 30,
      },
      facingMode: (isFront ? "user" : "environment"),
      optional: (videoSourceId ? [{sourceId: videoSourceId}] : []),
    }
  }, function (stream) {
    console.log('getUserMedia success', stream);
    callback(stream);
  }, logError);
}

function logError(error) {
  console.log("logError", error);
}

function mapHash(hash, func) {
  const array = [];
  for (const key in hash) {
    const obj = hash[key];
    array.push(func(obj, key));
  }
  return array;
}

function getStats() {
  const pc = pcPeers[Object.keys(pcPeers)[0]];
  if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
    const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
    console.log('track', track);
    pc.getStats(track, function(report) {
      console.log('getStats report', report);
    }, logError);
  }
}

function onLogin(data){
    if (data.success === false) {
       _this.setState({ message: "oops...try a different room name" })
   } else {
       //var loginContainer = document.getElementById('loginContainer');
       //loginContainer.parentElement.removeChild(loginContainer);
       room = data.room;
       company = _this.state.company;
       console.log("Login Successfull");
       console.log("logged in as :"+room);
       console.log(data.userlist);
       let toArray = _.keys(data.userlist);
       const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});
       users = data.userlist;
       _this.setState({ currScreen: 'userList', message: "", dataSource: ds.cloneWithRows(toArray) })

       const user = {
        room: room,
        company: company
      };

      rememberUser(user);

       let toArrayVoiceMail = _.keys(data.voicemails);
       console.log("data.voicemails:");
       console.log(data.voicemails);
       voicemailsData = data.voicemails;

      insertVoiceMails(voicemailsData).then().catch(error => {
        alert(`Cannot inserting voice mail. Error: ${JSON.stringify(error)}`);     
      });
    }
}

function onLogout(data){
  if (data.success === false) {
    console.log("cannot logout");
  } else {
    console.log("logout!");
    _this.setState({ currScreen: 'login' })
  }
}

function ensureDirectoryExistence(filePath) {
  var dirname = path.dirname(filePath);
  RNFS.exists(dirname).then(exist => {
    if (!exist){
      console.log("mkdir: " + dirname);
      RNFS.mkdir(dirname);
    }
  });
}

async function writeVoiceMailFiles(voicemailsData){
  for (var key in voicemailsData){
    ensureDirectoryExistence(AudioUtils.DocumentDirectoryPath + key);
    console.log(AudioUtils.DocumentDirectoryPath + key);
    RNFS.writeFile(AudioUtils.DocumentDirectoryPath + key, voicemailsData[key], 'base64')
    .then((success) => {
      console.log('FILE WRITTEN!');
    })
    .catch((err) => {
      console.log("error: " + err.message);
    });
   }
}

function acceptCall(data){
  console.log("accept call");
  // code
  socket.send({
       type: "call_accepted",
       company: this.state.company,
       callername: data.callername,
       from: room
      })
  
  if(_this.state.currScreen != 'startVideo'){
    _this.setState({ currScreen: 'startVideo' })
  }
  createPC(users[data.callername], true)
}

function rejectCall(data){
    console.log("reject call");
    socket.send({
           type: "call_rejected",
           company: this.state.company,
           callername: data.callername,
           from: room
    })
    busy = false
    this.setState({ callOrHangUp: 'Call' })
    incallwith = ""
}
function onGettingCalled(data){
        if(busy == false){
            busy = true
            this.setState({ callOrHangUp: 'Hang Up' })
            incallwith = data.callername
            //var res = confirm(data.callername+" is calling you");
            Alert.alert(
              'Incoming Call',
              data.callername+" is calling you",
              [
                {text: 'Cancel', onPress: () => rejectCall(data), style: 'cancel'},
                {text: 'OK', onPress: () => acceptCall(data) },
              ],
              { cancelable: false }
            )

             }else{
                 console.log("call busy");
                 //this.setState({ callResponse: "Call accepted by :"+ data.responsefrom })
                 socket.send({
                        type: "call_busy",
                        company: this.state.company,
                        callername: data.callername,
                        from: room
                 })

             }
}
function onResponse(data){
  switch(data.response){
    case "accepted":
      incallwith = data.responsefrom;
      _this.setState({ callResponse: "Call accepted by "+ data.responsefrom })
      // code
      break;
    case "rejected":
      _this.setState({ callResponse: "Call rejected by "+ data.responsefrom })
      busy = false;
      this.setState({ callOrHangUp: "Call" })
      incallwith = ""
      break;
    case "busy":
      _this.setState({ callResponse: data.responsefrom+" call busy" })
      busy = false;
      this.setState({ callOrHangUp: 'Call' })
      incallwith = ""
      break;
    default:
      _this.setState({ callResponse: data.responsefrom+" is offline" })
      busy = false;
      this.setState({ callOrHangUp: 'Call' })
      incallwith = ""
  }

}
socket.on('connect', function(data) {
  console.log('connect');
  getLocalStream(true, function(stream) {
    localStream = stream;
    _this.setState({selfViewSrc: stream.toURL()});
    // container.setState({status: 'ready', info: 'Please enter or create room ID'});
  });
});

function createPC(socketId, isOffer) {
  const pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  pc.onicecandidate = function (event) {
    console.log('onicecandidate', event.candidate);
    if (event.candidate) {
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
    }
  };

  function createOffer() {
    pc.createOffer(function(desc) {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, function () {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  }

  pc.onnegotiationneeded = function () {
    console.log('onnegotiationneeded');
    if (isOffer) {
      createOffer();
    }
  }

  pc.oniceconnectionstatechange = function(event) {
    console.log('oniceconnectionstatechange', event.target.iceConnectionState);
    if (event.target.iceConnectionState === 'completed') {
      setTimeout(() => {
        getStats();
      }, 1000);
    }
    if (event.target.iceConnectionState === 'connected') {
      createDataChannel();
    }
  };
  pc.onsignalingstatechange = function(event) {
    console.log('onsignalingstatechange', event.target.signalingState);
  };

  pc.onaddstream = function (event) {
    console.log('onaddstream', event.stream);
    _this.setState({info: 'One peer join!'});

    const remoteList = _this.state.remoteList;
    remoteList[socketId] = event.stream.toURL();
    _this.setState({ remoteList: remoteList });

  };
  pc.onremovestream = function (event) {
    console.log('onremovestream', event.stream);
  };

  pc.addStream(localStream);
  function createDataChannel() {
    if (pc.textDataChannel) {
      return;
    }
    const dataChannel = pc.createDataChannel("text");

    dataChannel.onerror = function (error) {
      console.log("dataChannel.onerror", error);
    };

    dataChannel.onmessage = function (event) {
      console.log("dataChannel.onmessage:", event.data);
      // _this.receiveTextData({user: socketId, message: event.data});
    };

    dataChannel.onopen = function () {
      console.log('dataChannel.onopen');
      // _this.setState({textRoomConnected: true});
    };

    dataChannel.onclose = function () {
      console.log("dataChannel.onclose");
    };

    pc.textDataChannel = dataChannel;
  }
  return pc;
}

function exchange(data) {
  const fromId = data.from;
  let pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
  } else {
    pc = createPC(fromId, false);
  }

  if (data.sdp) {
    console.log('exchange sdp', data);
    pc.setRemoteDescription(new RTCSessionDescription(data.sdp), function () {
      if (pc.remoteDescription.type == "offer")
        pc.createAnswer(function(desc) {
          console.log('createAnswer', desc);
          pc.setLocalDescription(desc, function () {
            console.log('setLocalDescription', pc.localDescription);
            socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
    }, logError);
  } else {
    console.log('exchange candidate', data);
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

socket.on('exchange', function(data){
  exchange(data);
});

socket.on('roommessage', function(message){
            var data = message;
            let currUsers
            const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});
            switch(data.type) {
                 case "login":
                 currUsers = _this.state.dataSource._dataBlob["s1"];
                 currUsers.push(data.room);

                 console.log("data.room: "+ data.room);
                 console.log("data.socketId: "+ data.socketId);
                 users[data.room] = data.socketId;
                 _this.setState({ dataSource: ds.cloneWithRows(currUsers) })
                        console.log("New user : "+data.room);
                        break;
                 case "disconnect":
                   currUsers = _this.state.dataSource._dataBlob["s1"];
                   currUsers = _.pull(currUsers, data.room);
                   delete users[data.room];
                   _this.setState({ dataSource: ds.cloneWithRows(currUsers) })
                   console.log("User disconnected : "+data.room);
                 break;
                 case "logout":
                   currUsers = _this.state.dataSource._dataBlob["s1"];
                   currUsers = _.pull(currUsers, data.room);
                   delete users[data.room];
                   _this.setState({ dataSource: ds.cloneWithRows(currUsers) })
                   console.log("User logged out : "+data.room);
                 break;
                default:
                    break;
            }
        })
socket.on('message', function(message){
            var data = message;
            _this.setState({ callResponse: "" })
            switch(data.type) {
                case "login":
                        onLogin(data);
                        break;
                case "logout":
                        onLogout(data);
                        break;
                case "call_request":
                      console.log("getting called");
                        onGettingCalled(data);
                        break;
                case "call_response":
                        onResponse(data);
                      break;
                default:
                    break;
            }
    })

export default class VideoCallingApp extends Component {

  constructor(props) {
     super(props);
     const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});

     this.state = {
      currScreen: 'login',
      text : (room!="" ? room : "userA"),
      company : (company!="" ? company : "companyA"),
      message : '',
      callResponse : '',
      dataSource: ds.cloneWithRows([]),
      voiceMails : [],
      remoteList: {},
      callOrHangUp: "Call",
      deviceID: "",
      currentTime: 0.0,
      recording: false,
      stoppedRecording: false,
      hasPermission: undefined,
      audioPath: AudioUtils.DocumentDirectoryPath + '/test.aac',
      audioFileURL: "",
    }

    readyToLogin().then(() => {
      checkIfLoggedIn().then((loggedIn) => {
        this.setState({currScreen:(loggedIn ? 'userList' : 'login')});
        if(loggedIn){
          getLoggedInUser().then((user) => {
            room = user.room;
            company = user.company;

            this.setState({text:room});
            this.setState({company:company});

            this.onPressLogin();
          });
        }
      }).catch((error) => {
        console.log("error: " + error);
      });
    }).catch((error) => {
        alert(`ready to login error ${error}`);
    });  
    // the user of which curren video screen has been rendered
    this.currUser = "";

    this.reloadData();
    realm.addListener('change', () => {
        this.reloadData();
    });
  }

  reloadData = () => {
    queryAllVoiceMails().then((voiceMails) => {
      this.setState({ voiceMails });
    }).catch((error) => {
      console.log("error: " + error);
      this.setState({ voiceMails: [] });
    });
    console.log(`reloadData`);
  }

  prepareRecordingPath(audioPath){
    AudioRecorder.prepareRecordingAtPath(audioPath, {
      SampleRate: 22050,
      Channels: 1,
      AudioQuality: "Low",
      AudioEncoding: "aac",
      AudioEncodingBitRate: 32000
    });
  }

  componentDidMount(){
    this._checkPermission().then((hasPermission) => {
      this.setState({ hasPermission });

      if (!hasPermission) return;

      this.prepareRecordingPath(this.state.audioPath);

      AudioRecorder.onProgress = (data) => {
        this.setState({currentTime: Math.floor(data.currentTime)});
      };

      AudioRecorder.onFinished = (data) => {
        // Android callback comes in the form of a promise instead.
        // console.log("finished!");
        // this.setState({audioFileURL: data.audioFileURL, audioFileSize: data.audioFileSize});

        if (Platform.OS === 'ios') {
          this._finishRecording(data.status === "OK", data.audioFileURL, data.audioFileSize);
        }
      };
    });

    console.log("mounted");
    console.log("DeviceID: ");
    console.log(DeviceInfo.getDeviceId());
    this.setState({ deviceID: DeviceInfo.getDeviceId() })
    _this = this;


  }

  _checkPermission() {
    if (Platform.OS !== 'android') {
      return Promise.resolve(true);
    }

    const rationale = {
      'title': 'Microphone Permission',
      'message': 'AudioExample needs access to your microphone so you can record audio.'
    };

    return PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, rationale)
      .then((result) => {
        console.log('Permission result:', result);
        return (result === true || result === PermissionsAndroid.RESULTS.GRANTED);
      });
  }

  onPressLogin(){
    let room = this.state.text
    let company = this.state.company
    if(room == ""){
      this.setState({ message: "Please enter room name" })
    }else{
        socket.send({
          type: "login",
          room: room,
          company: company,
          deviceID: this.state.deviceID,
        })
    }
  }
  onPressLogout(){
    let room = this.state.text
    let company = this.state.company
    forgetUser();
    this.setState({ currScreen: 'login' })
    socket.send({
      type: "logout",
      room: room,
      company: company,
      deviceID: this.state.deviceID,
    });
  }
  renderRow(data){
    return(<View style={styles.rowContainer}>
      <TouchableOpacity onPress={() => this.startVideo(data) }><Text style={styles.text} >{ data }</Text></TouchableOpacity>
      </View>)
  }
  backtouserList(){
    this.currUser = "";
    this.setState({ currScreen: 'userList', callResponse : '' })
  }

  async _record() {
    if (this.state.recording) {
      console.warn('Already recording!');
      return;
    }

    if (!this.state.hasPermission) {
      console.warn('Can\'t record, no permission granted!');
      return;
    }

    if(this.state.stoppedRecording){
      this.prepareRecordingPath(this.state.audioPath);
    }

    this.setState({recording: true, paused: false});

    try {
      const filePath = await AudioRecorder.startRecording();
    } catch (error) {
      console.error(error);
    }
  }

  _finishRecording(didSucceed, filePath, fileSize) {
    this.setState({ finished: didSucceed });
    console.log(`Finished recording of duration ${this.state.currentTime} seconds at path: ${filePath} and size of ${fileSize || 0} bytes`);
  }

  async _stop() {
    if (!this.state.recording) {
      console.warn('Can\'t stop, not recording!');
      return;
    }

    this.setState({stoppedRecording: true, recording: false, paused: false});

    try {
      const filePath = await AudioRecorder.stopRecording();

      if (Platform.OS === 'android') {
        console.log("filePath: " + filePath);
        this._finishRecording(true, filePath);
      }

      RNFS.readFile(filePath, 'base64')
      .then(contents => {
        this.setState({audioFileURL: contents});

        var files = {
          type: "voice_mail",
          company: this.state.company,
          to: this.currUser,
          from: room,
          audio: {
              type: 'audio/aac',
              dataURL: "data:audio/aac;base64," + contents
            }
        };

        socket.emit('message', files);
      });
      return filePath;
    } catch (error) {
      console.error(error);
    }
  }

  startVideo(data){
    //console.warn("Video "+data );
    this.currUser = data;
    this.setState({ currScreen: 'startVideo' })
  }

  checkVoiceMail(){
    this.setState({ currScreen: 'voiceMail' })
  }

  playVoiceMail(data){
    // These timeouts are a hacky workaround for some issues with react-native-sound.
      // See https://github.com/zmxv/react-native-sound/issues/89.
      console.log("play voice mail");
      setTimeout(() => {
        var sound = new Sound(AudioUtils.DocumentDirectoryPath + data, '', (error) => {
          if (error) {
            console.log("this.state.audioPath: " + this.state.audioPath)
            console.log('failed to load the sound', error);
          }
        });

        setTimeout(() => {
          sound.play((success) => {
            if (success) {
              console.log('successfully finished playing');
            } else {
              console.log('playback failed due to audio decoding errors');
            }
          });
        }, 100);
      }, 100);
  }

  callUser(){
    busy = true;
    this.setState({ callOrHangUp: 'Hang Up' })
    incallwith = this.currUser
    socket.send({
     type: "call_user",
     company: this.state.company,
     name: incallwith,
     callername: room
   })
  }
  renderVoiceMail(){
    return(
      <View style={{ flex:1 }}>
        <StatusBar barStyle="light-content"/>
        <View style={styles.toolbar}>
          <TouchableOpacity onPress={() => this.backtouserList() }><Text style={styles.toolbarButtonLeft}>Back</Text></TouchableOpacity>
          <Text style={styles.toolbarTitle}>{ this.currUser }</Text>
          <Text style={styles.toolbarButton}></Text>
        </View>
        <FlatList
          style={styles.flatList}
          data={this.state.voiceMails}
          renderItem={({ item, index }) => <FlatListItem {...item} itemIndex={index}
            // popupDialogComponent={this.refs.popupDialogComponent}
            onPressItem={() => {
              this.playVoiceMail(item.path);
              checkVoiceMail(item.id).then().catch(error => {
                  alert(`Cannot check voice mail. Error: ${JSON.stringify(error)}`);     
              });
            }} 
            />}
          keyExtractor={item => item.id}
        />
      </View>
    )
  }
  renderVideo(){
    return(
      <View style={{ flex:1 }}>
      <StatusBar barStyle="light-content"/>
        <View style={styles.toolbar}>
                        <TouchableOpacity onPress={() => this.backtouserList() }><Text style={styles.toolbarButtonLeft}>Back</Text></TouchableOpacity>
                        <Text style={styles.toolbarTitle}>{ this.currUser }</Text>
                        <Text style={styles.toolbarButton}></Text>
        </View>
        <RTCView streamURL={this.state.selfViewSrc} style={styles.selfView}/>
        {
          mapHash(this.state.remoteList, function(remote, index) {
            return <RTCView key={index} streamURL={remote} style={styles.remoteView}/>
          })
        }
        <View style={styles.container}>
            <Button
              onPress={() => this.callUser() }
              title={ this.state.callOrHangUp }
              color="#81c04d"
            />
            <Button
              onPress={() => this._record() }
              title="Record"
              color="#81c04d"
            />
            <Button
              onPress={() => this._stop() }
              title="Stop"
              color="#81c04d"
            />
          <Text style={[styles.instructions,{ color: 'grey'}]}>{ this.state.callResponse }</Text>

          </View>
        </View>
    )
  }
  renderLogin(){
    return (
      <View style={{ flex:1 }}>
      <StatusBar barStyle="light-content"/>
        <View style={styles.toolbar}>
          <Text style={styles.toolbarButton}></Text>
          <Text style={styles.toolbarTitle}></Text>
          <Text style={styles.toolbarButton}></Text>
        </View>
      <View style={styles.container}>
          <Text style={styles.instructions}>
            Enter Room Name :
          </Text>
          <TextInput
            style={{padding:5, alignSelf: "center", height: 40,width: width*80/100, borderColor: 'gray', borderWidth: 1}}
            onChangeText={(text) => this.setState({text})}
            value={this.state.text}
          />
          <Text style={styles.instructions}>
            Enter Company Name :
          </Text>
          <TextInput
            style={{padding:5, alignSelf: "center", height: 40,width: width*80/100, borderColor: 'gray', borderWidth: 1}}
            onChangeText={(company) => this.setState({company})}
            value={this.state.company}
          />
          <Button
            onPress={() => this.onPressLogin() }
            title="Login"
            color="#81c04d"
          />
        <Text style={styles.instructions}>{ this.state.message }</Text>

        </View>
      </View>
    )
  }
  renderList(){
    return(
      <View style={{ flex:1 }}>
      <StatusBar barStyle="light-content"/>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => this.onPressLogout() }><Text style={styles.toolbarButtonLeft}>Log out</Text></TouchableOpacity>
        <Text style={styles.toolbarTitle}>{this.state.company}-{this.state.text}</Text>
        <TouchableOpacity onPress={() => this.checkVoiceMail() }><Text style={styles.toolbarButtonRight}>Voice Mail</Text></TouchableOpacity>
      </View>

      <ListView
      //style={{marginTop: 10}}
      enableEmptySections={true}
      dataSource={this.state.dataSource}
      renderRow={ (rowData) => this.renderRow(rowData) }
    />
    </View>)
  }
  render() {
    switch (this.state.currScreen) {
      case 'login':
        return this.renderLogin();
        break;
      case 'userList':
        return this.renderList();
        break;
      case 'startVideo':
        return this.renderVideo();
        break;
      case 'voiceMail':
      return this.renderVoiceMail();
      break;
      default:

    }
    return this.renderLogin();
  }
}

let FlatListItem = props => {
  const { itemIndex, id, path, checked, onPressItem} = props;
  showDeleteConfirmation = () => {
      Alert.alert(
          'Delete',
          'Delete a voice mail',
          [
              {
                  text: 'No', onPress: () => { },//Do nothing
                  style: 'cancel'
              },
              {
                  text: 'Yes', onPress: () => {
                    deleteVoiceMail(id).then().catch(error => {
                      alert(`Failed to delete voicemail with id = ${id}, error=${error}`);
                    });
                  }
              },
          ],
          { cancelable: true }
      );
  };
  return (
      <Swipeout right={[
        {
          text: 'Delete',
          backgroundColor: 'rgb(217, 80, 64)',
          onPress: showDeleteConfirmation
        }
      ]} autoClose={true}>
        <TouchableOpacity onPress={onPressItem}>
          <View style={{ backgroundColor: itemIndex % 2 == 0 ? 'powderblue' : 'skyblue' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, margin: 10 }}>{path}</Text>
              <Text style={{ fontSize: 18, margin: 10 }} numberOfLines={2}>{(checked? "true": "false")}</Text>
              {/* <Text style={{ fontSize: 18, margin: 10 }} numberOfLines={2}>{creationDate.toLocaleString()}</Text> */}
          </View>
        </TouchableOpacity>
      </Swipeout >
  );
}

const styles = StyleSheet.create({
  selfView: {
    width: 200,
    height: 150,
  },
  remoteView: {
    width: 200,
    height: 150,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
  rowContainer: {
    flex: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  flatList: {
    flex: 1,
    flexDirection: 'column',
  },
  text: {
    marginLeft: 12,
    fontSize: 16,
  },
  toolbar:{
        backgroundColor:'#81c04d',
        paddingTop:30,
        paddingBottom:10,
        flexDirection:'row'
    },
    toolbarButtonLeft:{
      marginLeft: 12,
        width: 100,
        color:'#fff',
        textAlign:'left'
    },
    toolbarButtonRight:{
      marginRight: 12,
      width: 100,
      color:'#fff',
      textAlign:'right'
  },
    toolbarTitle:{
        color:'#fff',
        textAlign:'center',
        fontWeight:'bold',
        flex:1         
    }
});

AppRegistry.registerComponent('VideoCallingApp', () => VideoCallingApp);