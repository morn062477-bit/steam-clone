"use client";

import { useEffect, useState } from "react";

/**
 * 데스크탑 로그인 화면의 QR 코드를 폰 카메라로 찍으면 열리는 페이지.
 * 이 브라우저가 이미 아는 기기(TrustedDevice)거나 로그인돼 있으면 승인 버튼만 뜨고,
 * 아니면 로그인 폼을 보여준 뒤 승인까지 한 번에 처리한다.
 */

type QrPageState = "invalid" | "recognized" | "form" | "done";

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: any };
}

export default function QrLoginPage() {
  const [token, setToken] = useState<string | null>(null);
  // 기본값은 로그인 폼이다. "이 기기 인식됨" 확인은 배경에서 진행하고, 응답이 오면
  // 그때 승인 화면으로 바꾼다 — 네트워크가 느리거나 확인 요청이 실패해도 폰에서
  // 계속 로그인을 진행할 수 있게, 확인 중이라고 화면을 막아두지 않는다.
  const [state, setState] = useState<QrPageState>("form");
  const [nickname, setNickname] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setState("invalid");
      setMsg({ text: "잘못된 QR 코드입니다.", ok: false });
      return;
    }
    setToken(t);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    fetch(`/api/auth/qr-login/info?token=${encodeURIComponent(t)}`, { signal: controller.signal })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok || !data.valid) {
          setState("invalid");
          setMsg({ text: data.error || "유효하지 않은 QR 코드입니다.", ok: false });
          return;
        }
        if (data.recognized?.nickname) {
          setNickname(data.recognized.nickname);
          setState("recognized");
        }
        // 인식된 기기가 아니면 이미 기본값인 로그인 폼이 떠 있으니 그대로 둔다.
      })
      .catch(() => {
        // 확인 요청이 실패/타임아웃돼도 로그인 폼은 그대로 쓸 수 있으니 조용히 무시한다.
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  async function confirm(body: Record<string, unknown>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const { ok, data } = await postJson("/api/auth/qr-login/confirm", { token, ...body });
      if (!ok) {
        setMsg({ text: data.error || "로그인 승인에 실패했습니다.", ok: false });
        return;
      }
      setState("done");
    } catch {
      setMsg({ text: "서버에 연결하지 못했습니다.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  function submitLogin() {
    if (!account.trim() || !password) {
      setMsg({ text: "계정 이름과 비밀번호를 모두 입력하세요.", ok: false });
      return;
    }
    confirm({ account: account.trim(), password, remember });
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <h1 className="login-title" style={{ fontSize: 22, marginBottom: 24 }}>
          QR 코드 로그인
        </h1>

        {state === "invalid" && <p className="login-msg">{msg?.text}</p>}

        {state === "recognized" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ marginBottom: 20 }}>
              <strong>{nickname}</strong> 님으로 이 기기에서 로그인하시겠습니까?
            </p>
            <button type="button" className="btn-login" disabled={busy} onClick={() => confirm({})}>
              로그인 승인
            </button>
            <div className={"login-msg" + (msg?.ok ? " ok" : "")}>{msg?.text}</div>
          </div>
        )}

        {state === "form" && (
          // <form onSubmit>은 하이드레이션이 끝나기 전에 탭하면 브라우저가 네이티브로
          // 폼을 제출(페이지 새로고침, token 쿼리 파라미터 유실)해버리는 문제가 있어서
          // 일부러 <form> 없이 순수 버튼 onClick으로만 처리한다.
          <div>
            <label className="field-label" htmlFor="qr-account">
              계정 이름으로 로그인
            </label>
            <input
              id="qr-account" className="login-input" type="text" autoComplete="off"
              value={account} onChange={(e) => setAccount(e.target.value)}
            />

            <label className="field-label" htmlFor="qr-password" style={{ color: "var(--text)" }}>
              비밀번호
            </label>
            <input
              id="qr-password" className="login-input" type="password" autoComplete="off"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitLogin(); }}
            />

            <label className="checkbox-row">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              이 기기 기억하기
            </label>

            <button className="btn-login" type="button" disabled={busy} onClick={submitLogin}>
              로그인 후 승인
            </button>
            <div className={"login-msg" + (msg?.ok ? " ok" : "")}>{msg?.text}</div>
          </div>
        )}

        {state === "done" && <p style={{ textAlign: "center" }}>로그인되었습니다. 이 창은 닫으셔도 됩니다.</p>}
      </div>
    </div>
  );
}
