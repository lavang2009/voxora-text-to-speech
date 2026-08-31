import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Apple,
  Building2,
  Chrome,
  Github,
} from "lucide-react";

import { Button, Card, Input, Label } from "../components/ui";

import {
  login,
  loginWithApple,
  loginWithGitHub,
  loginWithGoogle,
  loginWithMicrosoft,
  register,
} from "../services/authService";

export default function Auth({
  mode,
}: {
  mode: "login" | "register";
}) {
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    setErr("");

    try {
      await fn();
      nav("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Unable to continue.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    setErr("");

    if (mode === "login") {
      await act(() => login(email, pass));
      return;
    }

    if (!name.trim()) {
      setErr("Please enter your name.");
      return;
    }

    if (!email.trim()) {
      setErr("Please enter your email.");
      return;
    }

    if (!pass) {
      setErr("Please enter your password.");
      return;
    }

    if (pass !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    if (!terms) {
      setErr("Please accept the terms.");
      return;
    }

    await act(() => register(name.trim(), email.trim(), pass));
  };

  const handleGoogle = async () => {
    await act(loginWithGoogle);
  };

  const handleApple = async () => {
    await act(loginWithApple);
  };

  const handleMicrosoft = async () => {
    await act(loginWithMicrosoft);
  };

  const handleGitHub = async () => {
    await act(loginWithGitHub);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#080b14] p-4">
      <Card className="w-full max-w-md p-7">
        <h1 className="text-2xl font-black">
          {mode === "login"
            ? "Welcome back"
            : "Create your account"}
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Voxora AI Voice Studio
        </p>

        {mode === "login" && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleGoogle}
              disabled={busy}
            >
              <Chrome size={15} />
              Google
            </Button>

            <Button
              variant="outline"
              onClick={handleApple}
              disabled={busy}
            >
              <Apple size={15} />
              Apple
            </Button>

            <Button
              variant="outline"
              onClick={handleMicrosoft}
              disabled={busy}
            >
              <Building2 size={15} />
              Microsoft
            </Button>

            <Button
              variant="outline"
              onClick={handleGitHub}
              disabled={busy}
            >
              <Github size={15} />
              GitHub
            </Button>
          </div>
        )}

        <div className="mt-6">
          {mode === "register" && (
            <>
              <Label>Name</Label>

              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </>
          )}

          <div className="mt-4">
            <Label>Email</Label>

            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="mt-4">
            <Label>Password</Label>

            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
            />
          </div>

          {mode === "register" && (
            <>
              <div className="mt-4">
                <Label>Confirm password</Label>

                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <label className="mt-4 flex cursor-pointer gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="mt-1"
                />

                <span>
                  I agree to the terms and privacy policy.
                </span>
              </label>
            </>
          )}
        </div>

        {err && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
            {err}
          </p>
        )}

        <Button
          className="mt-5 w-full"
          disabled={busy}
          onClick={handleSubmit}
        >
          {busy
            ? "Please wait..."
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </Button>

        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link
                to="/register"
                className="text-violet-300 hover:text-violet-200"
              >
                Create one
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link
                to="/login"
                className="text-violet-300 hover:text-violet-200"
              >
                Sign in
              </Link>
            </>
          )}
        </p>

        {mode === "login" && (
          <Link
            to="/forgot-password"
            className="mt-2 block text-center text-sm text-slate-500 hover:text-slate-300"
          >
            Forgot password?
          </Link>
        )}
      </Card>
    </div>
  );
}