
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Upload,
  Play,
  WandSparkles,
  Trash2,
} from "lucide-react";

import {
  Button,
  Card,
  Label,
  Textarea,
} from "../components/ui";

import AudioPlayer from "../components/AudioPlayer";

import { useAppStore } from "../store/useAppStore";

import { auth } from "../lib/firebase";

import {
  addHistory,
} from "../services/firestoreService";

import {
  generateSpeech,
  listVoices,
} from "../services/ttsService";

const MAX = 20000;

export default function Studio() {
  const {
    user,
    voices,
    setVoices,
    preferences,
  } = useAppStore();

  const [text, setText] =
    useState(
      localStorage.getItem(
        "voxora-draft"
      ) || ""
    );

  const [voice, setVoice] =
    useState(
      preferences.defaultVoice || ""
    );

  const [lang, setLang] =
    useState(
      preferences.defaultLanguage ||
        "vi-VN"
    );

  const [speed, setSpeed] =
    useState(1);

  const [pitch, setPitch] =
    useState(0);

  const [volume, setVolume] =
    useState(1);

  const [format, setFormat] =
    useState<"mp3" | "wav">(
      preferences.defaultFormat ||
        "mp3"
    );

  const [audio, setAudio] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [err, setErr] =
    useState("");

  const [historySaved, setHistorySaved] =
    useState(false);

  /*
   * Auto-save draft
   */
  useEffect(() => {
    localStorage.setItem(
      "voxora-draft",
      text
    );
  }, [text]);

  /*
   * Load provider voices
   */
  useEffect(() => {
    let mounted = true;

    const loadVoices =
      async () => {
        try {
          const data =
            await listVoices();

          if (
            !mounted ||
            !Array.isArray(data) ||
            data.length === 0
          ) {
            return;
          }

          setVoices(data);

          /*
           * Ưu tiên voice tiếng Việt.
           */
          const vietnameseVoices =
            data.filter(
              (item: any) =>
                item.locale ===
                "vi-VN"
            );

          /*
           * Ưu tiên voice mặc định
           * nếu vẫn còn tồn tại.
           */
          const preferenceVoice =
            data.find(
              (item: any) =>
                item.id ===
                preferences.defaultVoice
            );

          /*
           * Voice theo language
           */
          const languageVoice =
            data.find(
              (item: any) =>
                item.locale ===
                lang
            );

          const preferred =
            preferenceVoice ||
            languageVoice ||
            vietnameseVoices[0] ||
            data[0];

          const exists =
            data.some(
              (item: any) =>
                item.id === voice
            );

          if (!exists) {
            setVoice(
              preferred.id
            );

            setLang(
              preferred.locale
            );
          }
        } catch (error) {
          console.error(
            "Voice loading error:",
            error
          );

          if (mounted) {
            setErr(
              "Unable to load voices."
            );
          }
        }
      };

    if (!voices.length) {
      loadVoices();
    }

    return () => {
      mounted = false;
    };
  }, [
    voices.length,
    setVoices,
    preferences.defaultVoice,
    lang,
    voice,
  ]);

  /*
   * Available voices for selected language
   */
  const available =
    useMemo(() => {
      return voices.filter(
        (item) =>
          item.locale === lang
      );
    }, [voices, lang]);

  /*
   * Current selected voice
   */
  const chosen =
    voices.find(
      (item) =>
        item.id === voice
    ) ||
    available[0] ||
    voices[0];

  /*
   * Import TXT / DOCX
   */
  const importFile = async (
    file: File
  ) => {
    setErr("");

    if (
      file.size >
      2 * 1024 * 1024
    ) {
      setErr(
        "Import is limited to 2MB."
      );
      return;
    }

    try {
      const filename =
        file.name.toLowerCase();

      /*
       * TXT
       */
      if (
        filename.endsWith(
          ".txt"
        )
      ) {
        const content =
          await file.text();

        if (!content.trim()) {
          setErr(
            "The selected file is empty."
          );
          return;
        }

        setText(
          content.slice(
            0,
            MAX
          )
        );

        return;
      }

      /*
       * DOCX
       */
      if (
        filename.endsWith(
          ".docx"
        )
      ) {
        const mammoth =
          await import(
            "mammoth.browser"
          );

        const result =
          await mammoth.extractRawText(
            {
              arrayBuffer:
                await file.arrayBuffer(),
            }
          );

        if (
          !result.value.trim()
        ) {
          setErr(
            "The DOCX file does not contain text."
          );
          return;
        }

        setText(
          result.value.slice(
            0,
            MAX
          )
        );

        return;
      }

      setErr(
        "Use TXT or DOCX."
      );
    } catch (error) {
      console.error(
        "Import error:",
        error
      );

      setErr(
        "Unable to import this file."
      );
    }
  };

  /*
   * Browser voice preview.
   *
   * This is preview only.
   * Actual Generate uses backend TTS.
   */
  const preview = () => {
    setErr("");

    if (!chosen) {
      setErr(
        "Voice is not available."
      );
      return;
    }

    if (!text.trim()) {
      setErr(
        "Enter some text first."
      );
      return;
    }

    const utterance =
      new SpeechSynthesisUtterance(
        text
      );

    utterance.rate = speed;

    utterance.pitch =
      Math.max(
        0.1,
        1 + pitch / 20
      );

    utterance.volume = volume;

    /*
     * Try to find a browser voice
     * matching selected locale.
     */
    const browserVoices =
      speechSynthesis.getVoices();

    const browserVoice =
      browserVoices.find(
        (item) =>
          item.lang
            .toLowerCase()
            .startsWith(
              chosen.locale
                .toLowerCase()
                .split("-")[0]
            )
      );

    if (browserVoice) {
      utterance.voice =
        browserVoice;
    }

    speechSynthesis.cancel();

    speechSynthesis.speak(
      utterance
    );
  };

  /*
   * Stop preview
   */
  const stopPreview = () => {
    speechSynthesis.cancel();
  };

  /*
   * Clear editor
   */
  const clearText = () => {
    stopPreview();

    setText("");
    setAudio("");
    setErr("");
    setHistorySaved(false);

    localStorage.removeItem(
      "voxora-draft"
    );
  };

  /*
   * Change language
   */
  const changeLanguage = (
    newLanguage: string
  ) => {
    setLang(newLanguage);

    const firstVoice =
      voices.find(
        (item) =>
          item.locale ===
          newLanguage
      );

    setVoice(
      firstVoice?.id || ""
    );
  };

  /*
   * Generate actual audio
   */
  const generate = async () => {
    setErr("");
    setHistorySaved(false);

    if (!user) {
      setErr(
        "Please sign in."
      );
      return;
    }

    if (!text.trim()) {
      setErr(
        "Enter some text."
      );
      return;
    }

    if (text.length > MAX) {
      setErr(
        `Text is too long. Maximum ${MAX} characters.`
      );
      return;
    }

    if (!chosen) {
      setErr(
        "Voice is not available."
      );
      return;
    }

    if (!auth.currentUser) {
      setErr(
        "Your session has expired. Please sign in again."
      );
      return;
    }

    setBusy(true);

    try {
      /*
       * Make sure Firebase token exists.
       */
      const token =
        await auth.currentUser.getIdToken(
          true
        );

      if (!token) {
        throw new Error(
          "Unable to authenticate with the server."
        );
      }

      /*
       * Backend TTS
       */
      const result =
        await generateSpeech(
          {
            text,
            voiceId: chosen.id,
            language:
              chosen.locale,
            speed,
            pitch,
            volume,
            format,
          },
          () =>
            auth.currentUser!.getIdToken(
              true
            )
        );

      /*
       * VERY IMPORTANT:
       *
       * Audio is considered successful
       * at this point.
       */
      if (
        !result ||
        !result.url
      ) {
        throw new Error(
          "The server did not return an audio file."
        );
      }

      setAudio(
        result.url
      );

      /*
       * Save history separately.
       *
       * Firestore failure must never
       * make audio generation fail.
       */
      try {
        const historyItem: {
          textPreview: string;
          voiceId: string;
          voiceName: string;
          language: string;
          format: string;
          duration: number;
          audioUrl?: string;
        } = {
          textPreview:
            text.slice(0, 140),

          voiceId:
            chosen.id,

          voiceName:
            chosen.name,

          language:
            chosen.locale,

          format,

          duration:
            Number(
              result.duration
            ) || 0,
        };

        /*
         * Only add audioUrl if it
         * actually exists.
         */
        if (
          result.audioUrl &&
          typeof result.audioUrl ===
            "string"
        ) {
          historyItem.audioUrl =
            result.audioUrl;
        }

        await addHistory(
          user.uid,
          historyItem
        );

        setHistorySaved(
          true
        );
      } catch (
        historyError
      ) {
        console.error(
          "History save failed:",
          historyError
        );

        /*
         * Do NOT remove audio.
         *
         * User can still listen
         * and download it.
         */
        setHistorySaved(
          false
        );
      }
    } catch (error: any) {
      console.error(
        "TTS generation failed:",
        error
      );

      setAudio("");

      setErr(
        error?.message ||
          "Unable to generate audio."
      );
    } finally {
      setBusy(false);
    }
  };

  const wordCount =
    text.trim()
      ? text
          .trim()
          .split(/\s+/)
          .length
      : 0;

  const paragraphCount =
    text.trim()
      ? text
          .split(
            /\n\s*\n/
          )
          .filter(
            (item) =>
              item.trim()
          ).length
      : 0;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">

      {/* HEADER */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-300">
            Create Voice
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Voice Studio
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Turn your text into
            real downloadable
            audio.
          </p>
        </div>

        {/* IMPORT */}
        <label>
          <input
            hidden
            type="file"
            accept=".txt,.docx"
            onChange={(event) => {
              const file =
                event.target
                  .files?.[0];

              if (file) {
                importFile(file);
              }

              event.target.value =
                "";
            }}
          />

          <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5">
            <Upload size={15} />
            Import
          </span>
        </label>
      </div>

      {/* MAIN */}
      <div className="grid gap-5 xl:grid-cols-[1fr_350px]">

        {/* EDITOR */}
        <Card className="p-4 md:p-6">

          <div className="flex items-center justify-between gap-3">
            <Label>
              Script
            </Label>

            <span className="text-right text-xs text-slate-600">
              {wordCount} words ·{" "}
              {text.length}/{MAX}
            </span>
          </div>

          <Textarea
            className="min-h-[430px] resize-y"
            value={text}
            maxLength={MAX}
            onChange={(event) =>
              setText(
                event.target.value
              )
            }
            placeholder="Write your script here..."
          />

          {/* TEXT STATS */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
            <span>
              Characters:{" "}
              {text.length}
            </span>

            <span>
              Words:{" "}
              {wordCount}
            </span>

            <span>
              Paragraphs:{" "}
              {paragraphCount}
            </span>
          </div>

          {/* ACTIONS */}
          <div className="mt-4 flex flex-wrap gap-2">

            <Button
              variant="outline"
              onClick={preview}
              disabled={busy}
            >
              <Play size={15} />
              Preview
            </Button>

            <Button
              variant="outline"
              onClick={stopPreview}
              disabled={busy}
            >
              Stop
            </Button>

            <Button
              variant="outline"
              onClick={clearText}
              disabled={
                busy ||
                (!text && !audio)
              }
            >
              <Trash2 size={15} />
              Clear
            </Button>

            <Button
              disabled={
                busy ||
                !text.trim() ||
                !chosen
              }
              onClick={generate}
            >
              <WandSparkles
                size={15}
              />

              {busy
                ? "Rendering..."
                : "Generate audio"}
            </Button>
          </div>

          {/* ERROR */}
          {err && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">
              {err}
            </div>
          )}

          {/* HISTORY STATUS */}
          {historySaved && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">
              Audio generated and
              saved to your history.
            </div>
          )}

          {/* AUDIO */}
          {audio && (
            <div className="mt-5">
              <AudioPlayer
                url={audio}
                format={format}
              />
            </div>
          )}
        </Card>

        {/* SETTINGS */}
        <Card className="space-y-6 p-5">

          {/* LANGUAGE */}
          <div>
            <Label>
              Language
            </Label>

            <select
              className="w-full rounded-xl border border-white/10 bg-slate-900 p-3"
              value={lang}
              onChange={(event) =>
                changeLanguage(
                  event.target.value
                )
              }
            >
              {[
                ...new Set(
                  voices.map(
                    (item) =>
                      item.locale
                  )
                ),
              ]
                .sort()
                .map(
                  (locale) => (
                    <option
                      key={locale}
                      value={locale}
                    >
                      {locale}
                    </option>
                  )
                )}
            </select>
          </div>

          {/* VOICE */}
          <div>
            <Label>
              Voice
            </Label>

            <select
              className="w-full rounded-xl border border-white/10 bg-slate-900 p-3"
              value={
                chosen?.id || ""
              }
              onChange={(event) =>
                setVoice(
                  event.target.value
                )
              }
            >
              {available.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name} —{" "}
                    {item.gender}
                  </option>
                )
              )}
            </select>

            {chosen && (
              <p className="mt-2 text-xs text-slate-600">
                {chosen.provider}{" "}
                ·{" "}
                {chosen.locale}
                <br />
                ID:{" "}
                {chosen.id}
              </p>
            )}
          </div>

          {/* SPEED */}
          <Range
            label="Speed"
            value={speed}
            min={0.5}
            max={2}
            step={0.05}
            set={setSpeed}
          />

          {/* PITCH */}
          <Range
            label="Pitch"
            value={pitch}
            min={-50}
            max={50}
            step={1}
            set={setPitch}
          />

          {/* VOLUME */}
          <Range
            label="Volume"
            value={volume}
            min={0}
            max={1}
            step={0.05}
            set={setVolume}
          />

          {/* FORMAT */}
          <div>
            <Label>
              Format
            </Label>

            <div className="grid grid-cols-2 gap-2">
              {(
                ["mp3", "wav"] as const
              ).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    setFormat(
                      item
                    )
                  }
                  className={`rounded-xl border p-3 transition ${
                    format === item
                      ? "border-violet-400/50 bg-violet-500/10"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/*
 * Range control
 */
function Range({
  label,
  value,
  min,
  max,
  step,
  set,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  set: (
    value: number
  ) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label>
          {label}
        </Label>

        <span className="text-xs text-slate-400">
          {value}
        </span>
      </div>

      <input
        className="w-full accent-violet-400"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) =>
          set(
            Number(
              event.target.value
            )
          )
        }
      />
    </div>
  );
}
