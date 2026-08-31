
import axios from "axios";

const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string>;
  }
).env;

const API =
  viteEnv?.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

/**
 * Get real voices from backend
 */
export const listVoices = async () => {
  const response =
    await axios.get(
      `${API}/voices`
    );

  return response.data.data;
};

/**
 * Generate real audio
 */
export const generateSpeech = async (
  payload: {
    text: string;
    voiceId: string;
    language: string;
    speed: number;
    pitch: number;
    volume: number;
    format: "mp3" | "wav";
  },
  getToken: () => Promise<string>
) => {
  const token =
    await getToken();

  try {
    const response =
      await axios.post(
        `${API}/tts/generate`,
        payload,
        {
          responseType: "blob",
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    return {
      url: URL.createObjectURL(
        response.data
      ),

      blob:
        response.data as Blob,

      audioUrl:
        response.headers[
          "x-audio-url"
        ] || undefined,

      duration:
        Number(
          response.headers[
            "x-audio-duration"
          ] || 0
        ),
    };
  } catch (error: any) {
    let message =
      "Unable to generate audio.";

    try {
      const blob =
        error?.response?.data;

      if (
        blob instanceof Blob
      ) {
        const text =
          await blob.text();

        const data =
          JSON.parse(text);

        message =
          data?.error?.message ||
          message;

        console.error(
          "TTS API error:",
          data
        );
      } else {
        message =
          error?.response?.data
            ?.error?.message ||
          message;
      }
    } catch {
      console.error(
        "TTS raw error:",
        error?.response?.data
      );
    }

    throw new Error(message);
  }
};

/**
 * Upload avatar
 */
export const uploadAvatar = async (
  file: File,
  getToken: () => Promise<string>
) => {
  const token =
    await getToken();

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  const response =
    await axios.post(
      `${API}/upload/avatar`,
      formData,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  return response.data.data;
};
