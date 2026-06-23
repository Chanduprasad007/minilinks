import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collectionGroup 
} from "firebase/firestore";

import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
const googleProvider = new GoogleAuthProvider();

export { 
  app, 
  auth, 
  db, 
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup
};
