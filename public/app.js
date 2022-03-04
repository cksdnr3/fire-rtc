mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let joinDialog = null;
let createDialog = null;

function init() {
  document
    .querySelector("#cameraBtn")
    .addEventListener("click", onClickOpenUserMedia);
  document.querySelector("#hangupBtn").addEventListener("click", onClickHangup);
  document.querySelector("#createBtn").addEventListener("click", onClickCreate);
  document.querySelector("#joinBtn").addEventListener("click", onClickJoin);
  joinDialog = new mdc.dialog.MDCDialog(document.querySelector("#join-dialog"));
  createDialog = new mdc.dialog.MDCDialog(
    document.querySelector("#create-dialog")
  );
}

function onClickJoin() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;

  document
    .querySelector("#confirmJoinBtn")
    .addEventListener("click", onClickConfirm, { once: true });
  async function onClickConfirm() {
    roomId = document
      .querySelector("#join-dialog")
      .querySelector("#room-id").value;
    document.querySelector(
      "#currentRoom"
    ).innerText = `Current room is ${roomId} - You are the callee!`;
    await joinRoomById(roomId);
  }
  joinDialog.open();
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(roomId);
  const roomSnapshot = await roomRef.get();

  if (roomSnapshot.exists) {
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    collectIceCandidates(roomRef, peerConnection);

    peerConnection.addEventListener("track", (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    });

    const offer = roomSnapshot.data().offer;
    console.log("Set remote description: ", offer);
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    console.log("Set local description: ", answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
  }
}

function onClickCreate() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;
  document
    .querySelector("#confirmCreateBtn")
    .addEventListener("click", onClickConfirm, { once: true });

  async function onClickConfirm() {
    const db = firebase.firestore();

    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    console.log("Set local description: ", offer);
    await peerConnection.setLocalDescription(offer);

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    };
    roomId = document
      .querySelector("#create-dialog")
      .querySelector("#room-id").value;

    const roomRef = db.collection("rooms").doc(roomId);
    await roomRef.set(roomWithOffer);

    document.querySelector(
      "#currentRoom"
    ).innerText = `Current room is ${roomId} - You are the caller!`;

    roomRef.onSnapshot(async (snapshot) => {
      console.log("Got updated room:", snapshot.data());
      const answer = snapshot.data().answer;
      if (!peerConnection.currentRemoteDescription && answer) {
        console.log("Set remote description: ", answer);
        await peerConnection.setRemoteDescription(answer);
      }
    });

    collectIceCandidates(roomRef, peerConnection);

    peerConnection.addEventListener("track", (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    });
  }
  createDialog.open();
}

async function onClickHangup() {
  const tracks = document.querySelector("#localVideo").srcObject.getTracks();
  tracks.forEach((track) => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach((track) => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector("#localVideo").srcObject = null;
  document.querySelector("#remoteVideo").srcObject = null;
  document.querySelector("#cameraBtn").disabled = false;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#hangupBtn").disabled = true;
  document.querySelector("#currentRoom").innerText = "";

  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    const candidates = await roomRef.collection("candidates").get();
    candidates.forEach(async (candidate) => {
      await candidate.delete();
    });
    await roomRef.delete();
  }
  // location.reload(true);
}

async function onClickOpenUserMedia() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });
  document.querySelector("#localVideo").srcObject = stream;
  localStream = stream;

  remoteStream = new MediaStream();
  document.querySelector("#remoteVideo").srcObject = remoteStream;

  document.querySelector("#cameraBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = false;
  document.querySelector("#createBtn").disabled = false;
  document.querySelector("#hangupBtn").disabled = false;
}

async function collectIceCandidates(roomRef, peerConnection) {
  const candidatesCollection = roomRef.collection("candidates");
  peerConnection.addEventListener("icecandidate", async (event) => {
    if (event.candidate) {
      const json = event.candidate.toJSON();
      await candidatesCollection.add(json);
    }
  });

  roomRef.collection("candidates").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });
}

init();
