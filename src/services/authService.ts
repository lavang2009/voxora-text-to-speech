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
  signInWithRedirect,
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

const getProviderName = (user: User): string => {
  return (
    user.providerData[0]?.providerId ||
    "password"
  );
};

export const appUser = (user: User) => {
  return {
    uid: user.uid,
    displayName:
      user.displayName || "Creator",
    email: user.email || "",
    photoURL:
      user.photoURL || undefined,
    provider: getProviderName(user),
  };
};

async function ensureUserDocument(
  user: User
) {
  const userRef = doc(
    db,
    "users",
    user.uid
  );

  const snapshot =
    await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(
      userRef,
      {
        uid: user.uid,

        displayName:
          user.displayName ||
          "Creator",

        email:
          user.email || "",

        photoURL:
          user.photoURL ||
          null,

        provider:
          getProviderName(user),

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),

        plan: "free",

        preferences: {
          defaultLanguage:
            "vi-VN",

          defaultVoice: "",

          defaultSpeed: 1,

          defaultPitch: 0,

          defaultVolume: 1,

          defaultFormat: "mp3",

          theme: "system",
        },
      }
    );
  }
}

/**
 * Convert Firebase error
 * to a user-friendly message.
 */
function firebaseErrorMessage(
  error: any
): string {
  const code =
    error?.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Email này đã được sử dụng.";

    case "auth/invalid-email":
      return "Email không hợp lệ.";

    case "auth/missing-email":
      return "Vui lòng nhập email.";

    case "auth/missing-password":
      return "Vui lòng nhập mật khẩu.";

    case "auth/weak-password":
      return "Mật khẩu quá yếu. Hãy dùng mật khẩu mạnh hơn.";

    case "auth/invalid-credential":
      return "Email hoặc mật khẩu không chính xác.";

    case "auth/user-not-found":
      return "Không tìm thấy tài khoản.";

    case "auth/wrong-password":
      return "Mật khẩu không chính xác.";

    case "auth/user-disabled":
      return "Tài khoản này đã bị vô hiệu hóa.";

    case "auth/operation-not-allowed":
      return "Phương thức đăng nhập này chưa được bật trong Firebase Authentication.";

    case "auth/api-key-not-valid":
      return "Firebase API key không hợp lệ.";

    case "auth/invalid-api-key":
      return "Firebase API key không hợp lệ.";

    case "auth/project-not-found":
      return "Không tìm thấy Firebase project.";

    case "auth/network-request-failed":
      return "Không thể kết nối tới Firebase. Kiểm tra kết nối mạng.";

    case "auth/too-many-requests":
      return "Có quá nhiều lần thử. Vui lòng thử lại sau.";

    case "auth/popup-blocked":
      return "Trình duyệt đã chặn cửa sổ đăng nhập.";

    case "auth/popup-closed-by-user":
      return "Cửa sổ đăng nhập đã được đóng.";

    case "auth/cancelled-popup-request":
      return "Yêu cầu đăng nhập đã bị hủy.";

    case "auth/unauthorized-domain":
      return "Domain hiện tại chưa được phép trong Firebase Authentication.";

    case "auth/account-exists-with-different-credential":
      return "Email này đã được đăng ký bằng phương thức đăng nhập khác.";

    case "auth/credential-already-in-use":
      return "Thông tin đăng nhập này đã được liên kết với một tài khoản khác.";

    default:
      return (
        error?.message ||
        "Không thể thực hiện thao tác."
      );
  }
}

/**
 * Register with email/password.
 */
export const register = async (
  name: string,
  email: string,
  password: string
) => {
  try {
    const {
      user,
    } =
      await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

    await updateProfile(
      user,
      {
        displayName:
          name.trim(),
      }
    );

    /*
     * Verification email
     * must not block registration.
     */
    try {
      await sendEmailVerification(
        user
      );
    } catch (
      verificationError
    ) {
      console.warn(
        "Verification email failed:",
        verificationError
      );
    }

    /*
     * Firestore profile creation
     * is separated from Auth creation.
     */
    try {
      await ensureUserDocument(
        user
      );
    } catch (
      firestoreError
    ) {
      console.error(
        "Firestore profile creation failed:",
        firestoreError
      );

      /*
       * Do not delete the Auth account.
       * The account itself is already valid.
       */
    }

    return user;
  } catch (error: any) {
    console.error(
      "Firebase register error:",
      error
    );

    throw new Error(
      firebaseErrorMessage(error)
    );
  }
};

/**
 * Email/password login.
 */
export const login = async (
  email: string,
  password: string
) => {
  try {
    const {
      user,
    } =
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

    try {
      await ensureUserDocument(
        user
      );
    } catch (
      firestoreError
    ) {
      console.error(
        "Firestore profile check failed:",
        firestoreError
      );
    }

    return user;
  } catch (error: any) {
    console.error(
      "Firebase login error:",
      error
    );

    throw new Error(
      firebaseErrorMessage(error)
    );
  }
};

/**
 * Sign out.
 */
export const logout = async () => {
  await signOut(auth);
};

/**
 * Google login.
 *
 * Uses redirect instead of popup
 * to avoid auth/popup-blocked.
 */
export const loginWithGoogle =
  async () => {
    try {
      await signInWithRedirect(
        auth,
        googleProvider
      );

      /*
       * The browser leaves the app
       * and comes back after authentication.
       *
       * The actual user will be picked up
       * by onAuthStateChanged() in App.tsx.
       */
    } catch (error: any) {
      console.error(
        "Google redirect login error:",
        error
      );

      throw new Error(
        firebaseErrorMessage(error)
      );
    }
  };

/**
 * Apple login.
 */
export const loginWithApple =
  async () => {
    try {
      const result =
        await signInWithPopup(
          auth,
          appleProvider
        );

      await ensureUserDocument(
        result.user
      );

      return result.user;
    } catch (error: any) {
      console.error(
        "Apple login error:",
        error
      );

      throw new Error(
        firebaseErrorMessage(error)
      );
    }
  };

/**
 * Microsoft login.
 */
export const loginWithMicrosoft =
  async () => {
    try {
      const result =
        await signInWithPopup(
          auth,
          microsoftProvider
        );

      await ensureUserDocument(
        result.user
      );

      return result.user;
    } catch (error: any) {
      console.error(
        "Microsoft login error:",
        error
      );

      throw new Error(
        firebaseErrorMessage(error)
      );
    }
  };

/**
 * GitHub login.
 */
export const loginWithGitHub =
  async () => {
    try {
      const result =
        await signInWithPopup(
          auth,
          githubProvider
        );

      await ensureUserDocument(
        result.user
      );

      return result.user;
    } catch (error: any) {
      console.error(
        "GitHub login error:",
        error
      );

      throw new Error(
        firebaseErrorMessage(error)
      );
    }
  };

/**
 * Anonymous / Guest login.
 */
export const guest = async () => {
  try {
    const result =
      await signInAnonymously(
        auth
      );

    try {
      await ensureUserDocument(
        result.user
      );
    } catch (
      firestoreError
    ) {
      console.error(
        "Guest Firestore profile failed:",
        firestoreError
      );
    }

    return result.user;
  } catch (error: any) {
    console.error(
      "Guest login error:",
      error
    );

    throw new Error(
      firebaseErrorMessage(error)
    );
  }
};

/**
 * Reset password.
 */
export const resetPassword =
  async (
    email: string
  ) => {
    try {
      await sendPasswordResetEmail(
        auth,
        email.trim()
      );
    } catch (error: any) {
      console.error(
        "Reset password error:",
        error
      );

      throw new Error(
        firebaseErrorMessage(error)
      );
    }
  };

/**
 * Update profile.
 */
export const updateUser =
  async (
    data: {
      displayName?: string;
      photoURL?: string;
    }
  ) => {
    const user =
      auth.currentUser;

    if (!user) {
      throw new Error(
        "Please sign in."
      );
    }

    try {
      await updateProfile(
        user,
        data
      );

      await setDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        {
          ...data,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );
    } catch (error: any) {
      console.error(
        "Update profile error:",
        error
      );

      throw new Error(
        firebaseErrorMessage(error)
      );
    }
  };

/**
 * Get current Firebase user.
 */
export const getCurrentUser =
  () => {
    return auth.currentUser;
  };

/**
 * Listen for Firebase authentication changes.
 */
export const subscribeAuth = (
  callback: (
    user: User | null
  ) => void
) => {
  return onAuthStateChanged(
    auth,
    callback
  );
};
