import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Upload,
  Play,
  Square,
  WandSparkles,
  Trash2,
  Search,
  Heart,
  Star,
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
  removeFavorite,
  saveFavorite,
} from "../services/firestoreService";

import {
  generateSpeech,
  listVoices,
} from "../services/ttsService";

import type { Voice } from "../types";

const MAX = 20000;

type VoiceGender =
  | "all"
  | "Male"
  | "Female"
  | "Neutral";

type VoiceFilter =
  | "all"
  | "popular"
  | "favorites";

export default function Studio() {
  const {
    user,
    voices,
    setVoices,
    favorites,
    toggleFavorite,
    preferences,
  } = useAppStore();

  const [text, setText] = useState(
    localStorage.getItem("voxora-draft") || ""
  );

  const [voice, setVoice] = useState(
    preferences.defaultVoice || ""
  );

  const [lang, setLang] = useState(
    preferences.defaultLanguage || "vi-VN"
  );

  const [speed, setSpeed] = useState(
    preferences.defaultSpeed || 1
  );

  const [pitch, setPitch] = useState(
    preferences.defaultPitch || 0
  );

  const [volume, setVolume] = useState(
    preferences.defaultVolume ?? 1
  );

  const [format, setFormat] = useState<
    "mp3" | "wav"
  >(
    preferences.defaultFormat || "mp3"
  );

  const [audio, setAudio] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [historySaved, setHistorySaved] =
    useState(false);

  const [voiceSearch, setVoiceSearch] =
    useState("");

  const [voiceGender, setVoiceGender] =
    useState<VoiceGender>("all");

  const [voiceFilter, setVoiceFilter] =
    useState<VoiceFilter>("all");

  const [voiceLanguage, setVoiceLanguage] =
    useState("all");

  useEffect(() => {
    localStorage.setItem(
      "voxora-draft",
      text
    );
  }, [text]);

  useEffect(() => {
    let mounted = true;

    const loadVoices = async () => {
      try {
        const data = await listVoices();

        if (
          !mounted ||
          !Array.isArray(data) ||
          data.length === 0
        ) {
          return;
        }

        setVoices(data);

        const current = data.find(
          (item: Voice) =>
            item.id === voice
        );

        if (current) {
          setLang(current.locale);
          return;
        }

        const saved = data.find(
          (item: Voice) =>
            item.id ===
            preferences.defaultVoice
        );

        if (saved) {
          setVoice(saved.id);
          setLang(saved.locale);
          return;
        }

        const vietnamese = data.find(
          (item: Voice) =>
            item.locale === "vi-VN"
        );

        if (vietnamese) {
          setVoice(vietnamese.id);
          setLang(vietnamese.locale);
          return;
        }

        const first = data[0];

        if (first) {
          setVoice(first.id);
          setLang(first.locale);
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

    if (voices.length === 0) {
      loadVoices();
    }

    return () => {
      mounted = false;
    };
  }, [
    voices.length,
    setVoices,
    voice,
    preferences.defaultVoice,
  ]);

  const languages = useMemo(() => {
    return [
      ...new Set(
        voices.map(
          (item) => item.locale
        )
      ),
    ].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [voices]);

  const chosen =
    voices.find(
      (item) => item.id === voice
    ) || null;

  /*
   * Search trên TOÀN BỘ voice.
   * Không còn giới hạn theo lang.
   */
  const filteredVoices = useMemo(() => {
    const search =
      voiceSearch
        .trim()
        .toLowerCase();

    const result = voices.filter(
      (item) => {
        const matchesSearch =
          !search ||
          `${item.name} ${item.id} ${item.locale} ${item.provider}`
            .toLowerCase()
            .includes(search);

        const matchesGender =
          voiceGender === "all" ||
          item.gender === voiceGender;

        const matchesLanguage =
          voiceLanguage === "all" ||
          item.locale === voiceLanguage;

        const matchesFilter =
          voiceFilter === "all"
            ? true
            : voiceFilter === "popular"
              ? item.isPopular === true
              : Boolean(
                  favorites[item.id]
                );

        return (
          matchesSearch &&
          matchesGender &&
          matchesLanguage &&
          matchesFilter
        );
      }
    );

    return result.sort((a, b) => {
      if (
        Boolean(a.isPopular) !==
        Boolean(b.isPopular)
      ) {
        return a.isPopular ? -1 : 1;
      }

      if (
        a.locale === "vi-VN" &&
        b.locale !== "vi-VN"
      ) {
        return -1;
      }

      if (
        b.locale === "vi-VN" &&
        a.locale !== "vi-VN"
      ) {
        return 1;
      }

      return `${a.locale}${a.name}`.localeCompare(
        `${b.locale}${b.name}`
      );
    });
  }, [
    voices,
    voiceSearch,
    voiceGender,
    voiceLanguage,
    voiceFilter,
    favorites,
  ]);

  const selectVoice = (selected: Voice) => {
    setVoice(selected.id);
    setLang(selected.locale);
  };

  const handleFavorite = async (
    selected: Voice
  ) => {
    if (!user) {
      setErr(
        "Please sign in to save favorites."
      );
      return;
    }

    try {
      if (
        favorites[selected.id]
      ) {
        await removeFavorite(
          user.uid,
          selected.id
        );

        toggleFavorite(selected);
      } else {
        await saveFavorite(
          user.uid,
          selected
        );

        toggleFavorite(selected);
      }
    } catch (error) {
      console.error(
        "Favorite error:",
        error
      );

      setErr(
        "Unable to update favorite."
      );
    }
  };

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
      const fileName =
        file.name.toLowerCase();

      if (
        fileName.endsWith(".txt")
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
          content.slice(0, MAX)
        );

        return;
      }

      if (
        fileName.endsWith(".docx")
      ) {
        const mammoth =
          await import("mammoth");

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

      setErr("Use TXT or DOCX.");
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

    utterance.lang =
      chosen.locale;

    utterance.rate = speed;
    utterance.pitch = Math.max(
      0.1,
      1 + pitch / 20
    );
    utterance.volume = volume;

    speechSynthesis.cancel();
    speechSynthesis.speak(
      utterance
    );
  };

  const stopPreview = () => {
    speechSynthesis.cancel();
  };

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

  const generate = async () => {
    setErr("");
    setHistorySaved(false);

    if (!user) {
      setErr("Please sign in.");
      return;
    }

    if (!auth.currentUser) {
      setErr(
        "Your session has expired. Please sign in again."
      );
      return;
    }

    if (!text.trim()) {
      setErr("Enter some text.");
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

    setBusy(true);

    try {
      await auth.currentUser.getIdToken(
        true
      );

      const result =
        await generateSpeech(
          {
            text,
            voiceId: chosen.id,
            language: chosen.locale,
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

      if (
        !result ||
        !result.url
      ) {
        throw new Error(
          "The server did not return an audio file."
        );
      }

      /*
       * Hiển thị audio NGAY LẬP TỨC.
       */
      setAudio(result.url);

      /*
       * History độc lập với Generate.
       */
      try {
        const historyItem: any = {
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

        if (
          result.audioUrl
        ) {
          historyItem.audioUrl =
            result.audioUrl;
        }

        await addHistory(
          user.uid,
          historyItem
        );

        setHistorySaved(true);
      } catch (
        historyError
      ) {
        console.error(
          "History save failed:",
          historyError
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-300">
            Create Voice
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Voice Studio
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Turn your text into real
            downloadable audio.
          </p>
        </div>

        <label>
          <input
            hidden
            type="file"
            accept=".txt,.docx"
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              if (file) {
                importFile(file);
              }

              event.target.value = "";
            }}
          />

          <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5">
            <Upload size={15} />
            Import
          </span>
        </label>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <Label>Script</Label>

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

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
            <span>
              Characters: {text.length}
            </span>

            <span>
              Words: {wordCount}
            </span>

            <span>
              Paragraphs:{" "}
              {paragraphCount}
            </span>
          </div>

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
            >
              <Square size={15} />
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
              <WandSparkles size={15} />

              {busy
                ? "Rendering..."
                : "Generate audio"}
            </Button>
          </div>

          {err && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">
              {err}
            </div>
          )}

          {historySaved && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">
              Audio generated and saved
              to your history.
            </div>
          )}

          {audio && (
            <div className="mt-5">
              <AudioPlayer
                url={audio}
                format={format}
              />
            </div>
          )}
        </Card>

        <Card className="space-y-5 p-5">
          {chosen && (
            <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-violet-300">
                    Selected voice
                  </div>

                  <div className="mt-2 truncate font-bold">
                    {chosen.name}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {chosen.locale}
                    {" · "}
                    {chosen.gender}
                    {" · "}
                    {chosen.provider}
                  </div>

                  <div className="mt-1 truncate text-[10px] text-slate-600">
                    {chosen.id}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleFavorite(
                      chosen
                    )
                  }
                  className={
                    favorites[
                      chosen.id
                    ]
                      ? "text-pink-300"
                      : "text-slate-500"
                  }
                >
                  <Heart
                    size={18}
                    fill={
                      favorites[
                        chosen.id
                      ]
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              </div>
            </div>
          )}

          <div>
            <Label>
              Search voices
            </Label>

            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3.5 text-slate-500"
              />

              <input
                type="text"
                value={voiceSearch}
                onChange={(event) =>
                  setVoiceSearch(
                    event.target
                      .value
                  )
                }
                placeholder="Search voice, language or ID..."
                className="w-full rounded-xl border border-white/10 bg-white/[.04] py-3 pl-9 pr-3 text-sm outline-none focus:border-violet-400/50"
              />
            </div>
          </div>

          <div>
            <Label>
              Voice category
            </Label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  setVoiceFilter(
                    "all"
                  )
                }
                className={`rounded-xl border p-2 text-xs ${
                  voiceFilter ===
                  "all"
                    ? "border-violet-400/50 bg-violet-500/10"
                    : "border-white/10"
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() =>
                  setVoiceFilter(
                    "popular"
                  )
                }
                className={`flex items-center justify-center gap-1 rounded-xl border p-2 text-xs ${
                  voiceFilter ===
                  "popular"
                    ? "border-amber-400/50 bg-amber-500/10"
                    : "border-white/10"
                }`}
              >
                <Star size={12} />
                Popular
              </button>

              <button
                type="button"
                onClick={() =>
                  setVoiceFilter(
                    "favorites"
                  )
                }
                className={`flex items-center justify-center gap-1 rounded-xl border p-2 text-xs ${
                  voiceFilter ===
                  "favorites"
                    ? "border-pink-400/50 bg-pink-500/10"
                    : "border-white/10"
                }`}
              >
                <Heart size={12} />
                Favorites
              </button>
            </div>
          </div>

          <div>
            <Label>
              Language
            </Label>

            <select
              className="w-full rounded-xl border border-white/10 bg-slate-900 p-3"
              value={voiceLanguage}
              onChange={(event) =>
                setVoiceLanguage(
                  event.target.value
                )
              }
            >
              <option value="all">
                All languages
              </option>

              {languages.map(
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

          <div>
            <Label>
              Gender
            </Label>

            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  "all",
                  "Male",
                  "Female",
                  "Neutral",
                ] as const
              ).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setVoiceGender(
                        item
                      )
                    }
                    className={`rounded-xl border p-2 text-xs ${
                      voiceGender ===
                      item
                        ? "border-violet-400/50 bg-violet-500/10"
                        : "border-white/10"
                    }`}
                  >
                    {item ===
                    "all"
                      ? "All"
                      : item}
                  </button>
                )
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>
                Voices
              </Label>

              <span className="text-xs text-slate-500">
                {
                  filteredVoices.length
                }{" "}
                / {voices.length}
              </span>
            </div>

            <div className="max-h-[430px] overflow-y-auto rounded-2xl border border-white/10 bg-black/10">
              {filteredVoices.length ===
              0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No voices found.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredVoices.map(
                    (item) => {
                      const selected =
                        chosen?.id ===
                        item.id;

                      const favorite =
                        Boolean(
                          favorites[
                            item.id
                          ]
                        );

                      return (
                        <div
                          key={
                            item.id
                          }
                          className={`flex items-center gap-2 p-3 transition ${
                            selected
                              ? "bg-violet-500/10"
                              : "hover:bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              selectVoice(
                                item
                              )
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">
                                {
                                  item.name
                                }
                              </span>

                              {item.isPopular && (
                                <span className="shrink-0 rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                                  POPULAR
                                </span>
                              )}
                            </div>

                            <div className="mt-1 truncate text-xs text-slate-500">
                              {
                                item.locale
                              }
                              {" · "}
                              {
                                item.gender
                              }
                              {" · "}
                              {
                                item.provider
                              }
                            </div>

                            <div className="mt-1 truncate text-[10px] text-slate-600">
                              {
                                item.id
                              }
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleFavorite(
                                item
                              )
                            }
                            className={
                              favorite
                                ? "shrink-0 text-pink-300"
                                : "shrink-0 text-slate-600 hover:text-slate-300"
                            }
                          >
                            <Heart
                              size={16}
                              fill={
                                favorite
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </div>

          <Range
            label="Speed"
            value={speed}
            min={0.5}
            max={2}
            step={0.05}
            set={setSpeed}
          />

          <Range
            label="Pitch"
            value={pitch}
            min={-50}
            max={50}
            step={1}
            set={setPitch}
          />

          <Range
            label="Volume"
            value={volume}
            min={0}
            max={1}
            step={0.05}
            set={setVolume}
          />

          <div>
            <Label>
              Format
            </Label>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  "mp3",
                  "wav",
                ] as const
              ).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setFormat(
                        item
                      )
                    }
                    className={`rounded-xl border p-3 ${
                      format ===
                      item
                        ? "border-violet-400/50 bg-violet-500/10"
                        : "border-white/10"
                    }`}
                  >
                    {item.toUpperCase()}
                  </button>
                )
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

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
  set: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label>{label}</Label>

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
