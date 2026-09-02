import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth, db, DEMO_MODE } from "../firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// Function to test if Firebase auth is properly configured
const testFirebaseAuth = async () => {
  if (!auth) return false;
  try {
    // Try to get the auth instance - this will fail if auth is not properly configured
    await new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
      setTimeout(() => reject(new Error('Auth test timeout')), 1000);
    });
    return true;
  } catch (error) {
    console.log('🔥 Firebase Auth test failed, switching to demo mode:', error.message);
    return false;
  }
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(DEMO_MODE);
  const googleProvider = useMemo(() => new GoogleAuthProvider(), []);

  useEffect(() => {
    const initializeAuth = async () => {
      if (DEMO_MODE) {
        try {
          const savedUser = localStorage.getItem("demo_user");
          if (savedUser) {
            setUser(JSON.parse(savedUser));
          } else {
            setUser(null);
          }
        } catch (_) {
          setUser(null);
        }
        setLoading(false);
        return;
      }

      // Test if Firebase auth is properly configured
      const authWorking = await testFirebaseAuth();
      
      if (!authWorking) {
        console.log('🔥 Switching to DEMO MODE - Firebase Auth not properly configured');
        console.log('📝 To fix: Enable Email/Password authentication in Firebase Console > Authentication > Sign-in method');
        setIsDemoMode(true);
        try {
          const savedUser = localStorage.getItem("demo_user");
          if (savedUser) {
            setUser(JSON.parse(savedUser));
          } else {
            setUser(null);
          }
        } catch (_) {
          setUser(null);
        }
        setLoading(false);
        return;
      }

      if (!auth) {
        setLoading(false);
        return;
      }

      // Subscribe to Firebase auth state
      const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          setUser({ uid: fbUser.uid, email: fbUser.email });
        } else {
          setUser(null);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    };

    initializeAuth();
  }, []);

  const signup = async (email, password) => {
    if (!email?.trim() || !password?.trim()) {
      throw new Error("Email and password are required.");
    }

    if (isDemoMode || DEMO_MODE) {
      const trimmedEmail = email.trim().toLowerCase();
      try {
        const users = JSON.parse(localStorage.getItem("demo_registered_users") || "{}");
        if (users[trimmedEmail]) {
          throw new Error("Auth/email-already-in-use: The email address is already in use by another account.");
        }
        users[trimmedEmail] = password;
        localStorage.setItem("demo_registered_users", JSON.stringify(users));
        
        const demoUser = { uid: 'demo-user-' + trimmedEmail.split('@')[0], email: trimmedEmail };
        localStorage.setItem("demo_user", JSON.stringify(demoUser));
        setUser(demoUser);
        return demoUser;
      } catch (err) {
        throw new Error(err.message || "Failed to sign up.");
      }
    }

    if (!auth || !db) {
      throw new Error("Firebase authentication is not available. The app is running in demo mode.");
    }

    // Create user with Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const fbUser = cred.user;
    // Write minimal profile to Firestore
    await setDoc(doc(db, "users", fbUser.uid), {
      email: fbUser.email,
      createdAt: serverTimestamp()
    });
    // setUser will be updated by onAuthStateChanged subscription
    return fbUser;
  };

  const login = async (email, password) => {
    if (!email?.trim() || !password?.trim()) {
      throw new Error("Email and password are required.");
    }

    if (isDemoMode || DEMO_MODE) {
      const trimmedEmail = email.trim().toLowerCase();
      
      // Allow default credential admin@example.com / password
      if (trimmedEmail === "admin@example.com" && password === "password") {
        const demoUser = { uid: 'demo-user-admin', email: trimmedEmail };
        localStorage.setItem("demo_user", JSON.stringify(demoUser));
        setUser(demoUser);
        return demoUser;
      }

      try {
        const users = JSON.parse(localStorage.getItem("demo_registered_users") || "{}");
        const registeredPassword = users[trimmedEmail];
        
        if (!registeredPassword) {
          throw new Error("Auth/user-not-found: The user account does not exist. Please sign up.");
        }
        if (registeredPassword !== password) {
          throw new Error("Auth/wrong-password: The password is invalid.");
        }
        
        const demoUser = { uid: 'demo-user-' + trimmedEmail.split('@')[0], email: trimmedEmail };
        localStorage.setItem("demo_user", JSON.stringify(demoUser));
        setUser(demoUser);
        return demoUser;
      } catch (err) {
        throw new Error(err.message || "Failed to log in.");
      }
    }

    if (!auth) {
      throw new Error("Firebase authentication is not available. The app is running in demo mode.");
    }

    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  };

  const loginWithGoogle = async () => {
    if (isDemoMode || DEMO_MODE) {
      const demoUser = { uid: "demo-google-user", email: "demo-google-user@example.com", provider: "google" };
      localStorage.setItem("demo_user", JSON.stringify(demoUser));
      setUser(demoUser);
      return demoUser;
    }

    if (!auth) {
      throw new Error("Firebase authentication is not available. The app is running in demo mode.");
    }

    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  };

  const logout = async () => {
    if (isDemoMode || DEMO_MODE) {
      localStorage.removeItem("demo_user");
      setUser(null);
      return;
    }

    if (!auth) {
      throw new Error("Firebase authentication is not available. The app is running in demo mode.");
    }

    await signOut(auth);
    // setUser will be updated by onAuthStateChanged
  };

  const value = useMemo(() => ({ user, signup, login, loginWithGoogle, logout, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
