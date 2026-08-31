import {
  auth,
  appleProvider,
  googleProvider,
  microsoftProvider,
  githubProvider,
  db,
} from "../lib/firebase";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

const getProviderName = (user: User) => {
  return user.providerData[0]?.providerId ?? "password";
};

export const appUser = (user: User) => ({
  uid: user.uid,
  displayName: user.displayName || "Creator",
  email: user.email || "",
  photoURL: user.photoURL || undefined,
  provider: getProviderName(user),
});

async function ensureUserDocument(user: User) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || "Creator",
      email: user.email || "",
      photoURL: user.photoURL || null,
      provider: getProviderName(user),

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      plan: "free",

      preferences: {
        defaultLanguage: "en-US",
        defaultVoice: "",
        defaultSpeed: 1,
        defaultPitch: 0,
        defaultVolume: 1,
        defaultFormat: "mp3",
        theme: "system",
      },
    });
  }
}

function firebaseErrorMessage(error: any): string {
  const code = error?.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Email này đã được sử dụng.";

    case "auth/invalid-email":
      return "Email không hợp lệ.";

    case "auth/weak-password":
      return "Mật khẩu quá yếu. Hãy dùng mật khẩu mạnh hơn.";

    case "auth/operation-not-allowed":
      return "Đăng ký Email/Password chưa được bật trong Firebase Authentication.";

    case "auth/api-key-not-valid":
      return "Firebase API key không hợp lệ.";

    case "auth/project-not-found":
      return "Không tìm thấy Firebase project.";

    case "auth/network-request-failed":
      return "Không thể kết nối tới Firebase. Kiểm tra mạng.";

    case "auth/too-many-requests":
      return "Có quá nhiều lần thử. Vui lòng thử lại sau.";

    case "auth/invalid-api-key":
      return "Firebase API key không hợp lệ.";

    default:
      return error?.message || "Không thể thực hiện đăng ký.";
  }
}

export const register = async (
  name: string,
  email: string,
  password: string
) => {
  try {
    const { user } = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await updateProfile(user, {
      displayName: name,
    });

    try {
      await sendEmailVerification(user);
    } catch {
      // Không chặn đăng ký nếu gửi verification email thất bại.
    }

    await ensureUserDocument(user);

    return user;
  } catch (error: any) {
    console.error("Firebase register error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const login = async (
  email: string,
  password: string
) => {
  try {
    const { user } = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    await ensureUserDocument(user);

    return user;
  } catch (error: any) {
    console.error("Firebase login error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const logout = async () => {
  await signOut(auth);
};

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(
      auth,
      googleProvider
    );

    await ensureUserDocument(result.user);

    return result.user;
  } catch (error: any) {
    console.error("Google login error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const loginWithApple = async () => {
  try {
    const result = await signInWithPopup(
      auth,
      appleProvider
    );

    await ensureUserDocument(result.user);

    return result.user;
  } catch (error: any) {
    console.error("Apple login error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const loginWithMicrosoft = async () => {
  try {
    const result = await signInWithPopup(
      auth,
      microsoftProvider
    );

    await ensureUserDocument(result.user);

    return result.user;
  } catch (error: any) {
    console.error("Microsoft login error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const loginWithGitHub = async () => {
  try {
    const result = await signInWithPopup(
      auth,
      githubProvider
    );

    await ensureUserDocument(result.user);

    return result.user;
  } catch (error: any) {
    console.error("GitHub login error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const guest = async () => {
  try {
    const result = await signInAnonymously(auth);

    await ensureUserDocument(result.user);

    return result.user;
  } catch (error: any) {
    console.error("Guest login error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error("Reset password error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const updateUser = async (data: {
  displayName?: string;
  photoURL?: string;
}) => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in.");
  }

  try {
    await updateProfile(user, data);

    await setDoc(
      doc(db, "users", user.uid),
      {
        ...data,
        updatedAt: serverTimestamp(),
      },
      {
        merge: true,
      }
    );
  } catch (error: any) {
    console.error("Update profile error:", error);
    throw new Error(firebaseErrorMessage(error));
  }
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

export const subscribeAuth = (
  callback: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, callback);
};