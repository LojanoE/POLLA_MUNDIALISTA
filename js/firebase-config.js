// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvDxv2rEaOf0dgVDSkxL-uno5GWn-p1yg",
  authDomain: "polla-mundialista-83633.firebaseapp.com",
  projectId: "polla-mundialista-83633",
  storageBucket: "polla-mundialista-83633.firebasestorage.app",
  messagingSenderId: "763597088060",
  appId: "1:763597088060:web:10aa97544e083e516faa39",
  measurementId: "G-3PG30XT6TY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
