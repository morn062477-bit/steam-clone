"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 로그인 / 가입 / 이메일 인증 / 계정 만들기 / 완료 화면.
 *
 * 흐름: 로그인 → 가입하기 → 이메일 인증 모달 → 계정 만들기 → 완료 → 로그인
 *
 * 계정 저장과 로그인 확인은 실제로 API 를 친다 (POST /api/signup, /api/login).
 * 다만 진짜 세션은 아직 없다. 로그인 결과를 localStorage 에 들고 헤더 표시에만
 * 쓰며, 서버는 이후 요청에서 이 값을 신뢰하지 않는다.
 */

export type AuthView = "login" | "signup" | "create" | "done";
export type User = { id: string; nickname: string; email: string; avatarUrl: string | null };

const SESSION_KEY = "steam-clone:user";

export function readUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function writeUser(user: User | null) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: any };
}

/** 배경 타일. DB 이미지가 아직이면 CSS 기본색으로 남는다. */
function Tiles({ className, count, pool }: { className: string; count: number; pool: string[] }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={pool.length ? { backgroundImage: `url('${pool[i % pool.length]}')` } : undefined}
        />
      ))}
    </div>
  );
}

type Props = {
  view: AuthView | "store";
  pool: string[];
  onView: (v: AuthView | "store") => void;
  onLogin: (u: User) => void;
};

export default function Auth({ view, pool, onView, onLogin }: Props) {
  // 로그인
  const [loginMsg, setLoginMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [account, setAccount] = useState("");

  // 가입
  const [suEmail, setSuEmail] = useState("");
  const [suEmail2, setSuEmail2] = useState("");
  const [captcha, setCaptcha] = useState(false);
  const [agree, setAgree] = useState(false);
  const [signupMsg, setSignupMsg] = useState("");

  // 이메일 인증 모달
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 계정 만들기
  const [signupId, setSignupId] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [crName, setCrName] = useState("");
  const [crPw, setCrPw] = useState("");
  const [crPw2, setCrPw2] = useState("");
  const [createMsg, setCreateMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [doneName, setDoneName] = useState("");

  useEffect(() => () => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  function closeVerify() {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
    setVerifyEmail(null);
    setVerified(false);
    document.body.style.overflow = "";
  }

  /** 인증 대기 모달이 떠 있는 동안 실제 서버에 인증 완료 여부를 폴링한다. */
  useEffect(() => {
    if (!verifyEmail || !signupId || verified) return;

    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/signup-status?id=${encodeURIComponent(signupId)}`);
        const data = await res.json().catch(() => ({}));
        if (!data.verified) return;

        if (pollTimer.current) clearInterval(pollTimer.current);
        setVerified(true);
        verifyTimer.current = setTimeout(() => {
          closeVerify();
          setPendingEmail(verifyEmail);
          setCrName("");
          setCrPw("");
          setCrPw2("");
          setCreateMsg(null);
          onView("create");
        }, 900);
      } catch {
        /* 네트워크 오류는 다음 폴링에서 다시 시도 */
      }
    }, 2000);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEmail, signupId, verified]);

  // ---------- 로그인 ----------
  async function submitLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const id = account.trim();
    const pw = (form.elements.namedItem("password") as HTMLInputElement).value;

    if (!id || !pw) {
      setLoginMsg({ text: "계정 이름과 비밀번호를 모두 입력하세요.", ok: false });
      return;
    }
    setLoginBusy(true);
    setLoginMsg({ text: "확인 중…", ok: false });
    try {
      const { ok, data } = await postJson("/api/login", { account: id, password: pw });
      if (!ok) {
        setLoginMsg({ text: data.error || "로그인에 실패했습니다.", ok: false });
        return;
      }
      setLoginMsg({ text: `${data.nickname} 님, 로그인되었습니다.`, ok: true });
      (form.elements.namedItem("password") as HTMLInputElement).value = "";
      onLogin(data);
      setTimeout(() => onView("store"), 700);
    } catch {
      setLoginMsg({ text: "서버에 연결하지 못했습니다.", ok: false });
    } finally {
      setLoginBusy(false);
    }
  }

  // ---------- 가입 ----------
  async function submitSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const a = suEmail.trim();
    const b = suEmail2.trim();

    if (!a || !b) return setSignupMsg("이메일 주소를 두 칸 모두 입력하세요.");
    if (a !== b) return setSignupMsg("두 이메일 주소가 서로 다릅니다.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) return setSignupMsg("이메일 형식이 올바르지 않습니다.");
    if (!captcha) return setSignupMsg("사람인지 확인해 주세요.");
    if (!agree) return setSignupMsg("약관에 동의해야 계속할 수 있습니다.");

    setSignupMsg("인증 메일을 보내는 중…");
    const { ok, data } = await postJson("/api/auth/signup", { email: a });
    if (!ok) {
      setSignupMsg(data.error || "인증 메일을 보내지 못했습니다.");
      return;
    }

    setSignupMsg("");
    setSignupId(data.signupId);
    setVerifyEmail(a);
    setVerified(false);
    setHelpOpen(false);
    setResendMsg("");
    document.body.style.overflow = "hidden";
  }

  /** 인증 메일 재전송. 같은 이메일로 다시 호출하면 서버가 새 링크로 갱신해 재발송한다. */
  async function resendVerify() {
    if (!verifyEmail) return;
    setResendMsg("재전송 중…");
    const { ok, data } = await postJson("/api/auth/signup", { email: verifyEmail });
    if (!ok) {
      setResendMsg(data.error || "재전송하지 못했습니다.");
      return;
    }
    setSignupId(data.signupId);
    setResendMsg("다시 보냈습니다. 메일함을 확인해 주세요.");
  }

  // ---------- 계정 만들기 ----------
  async function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = crName.trim();

    if (!pendingEmail || !signupId) {
      setCreateMsg({ text: "이메일 인증부터 다시 진행해 주세요.", ok: false });
      setTimeout(() => onView("signup"), 900);
      return;
    }
    if (name.length < 6 || !/^[A-Za-z0-9]+$/.test(name)) {
      return setCreateMsg({ text: "계정 이름은 영문/숫자로 6자 이상이어야 합니다.", ok: false });
    }
    if (crPw.length < 8) return setCreateMsg({ text: "비밀번호는 8자 이상이어야 합니다.", ok: false });
    if (crPw !== crPw2) return setCreateMsg({ text: "두 비밀번호가 서로 다릅니다.", ok: false });

    setCreateBusy(true);
    setCreateMsg({ text: "저장 중…", ok: false });
    try {
      const { ok, data } = await postJson("/api/auth/complete-signup", {
        signupId,
        nickname: name,
        password: crPw,
      });
      if (!ok) {
        setCreateMsg({ text: data.error || "계정을 만들지 못했습니다.", ok: false });
        return;
      }
      // 저장 성공. 완료 화면으로 넘기고 로그인 칸에 계정 이름을 미리 채워 둔다.
      setPendingEmail("");
      setSignupId(null);
      setDoneName(data.nickname);
      setAccount(data.nickname);
      setLoginMsg(null);
      onView("done");
    } catch {
      setCreateMsg({ text: "서버에 연결하지 못했습니다.", ok: false });
    } finally {
      setCreateBusy(false);
    }
  }

  const go = (v: AuthView | "store") => (e: React.MouseEvent) => {
    e.preventDefault();
    onView(v);
  };

  return (
    <>
      {/* ===== 로그인 ===== */}
      <section id="loginView" className={view === "login" ? "on" : ""}>
        <Tiles className="login-bg" count={40} pool={pool} />
        <div className="login-veil" />

        <div className="login-inner">
          <div className="wrap">
            <h1 className="login-title">로그인</h1>

            <form className="login-box" autoComplete="off" onSubmit={submitLogin}>
              <div className="login-left">
                <label className="field-label" htmlFor="account">계정 이름으로 로그인</label>
                <input
                  className="login-input" type="text" id="account" name="account"
                  value={account} onChange={(e) => setAccount(e.target.value)}
                />

                <label className="field-label" htmlFor="password" style={{ color: "var(--text)" }}>비밀번호</label>
                <input className="login-input" type="password" id="password" name="password" />

                <label className="checkbox-row">
                  <input type="checkbox" defaultChecked />
                  로그인 정보 저장
                </label>

                <button className="btn-login" type="submit" disabled={loginBusy}>로그인</button>
                <div className={"login-msg" + (loginMsg?.ok ? " ok" : "")}>{loginMsg?.text}</div>
                <p className="help-link"><a href="#">로그인 관련 문제</a></p>
              </div>

              <div className="login-right">
                <p className="qr-title">또는 <strong>QR 코드로 로그인</strong></p>
                <div className="qr-code">
                  <svg viewBox="0 0 21 21" shapeRendering="crispEdges" role="img" aria-label="QR 코드 자리 표시자">
                    <rect width="21" height="21" fill="#fff" />
                    <g fill="#000">
                      <path d="M0 0h7v7H0z" /><path d="M1 1h5v5H1z" fill="#fff" /><path d="M2 2h3v3H2z" />
                      <path d="M14 0h7v7h-7z" /><path d="M15 1h5v5h-5z" fill="#fff" /><path d="M16 2h3v3h-3z" />
                      <path d="M0 14h7v7H0z" /><path d="M1 15h5v5H1z" fill="#fff" /><path d="M2 16h3v3H2z" />
                      <path d="M9 0h1v1H9zM11 1h1v1h-1zM9 2h1v1H9zM12 3h1v1h-1zM9 4h1v1H9zM11 5h1v1h-1z" />
                      <path d="M0 9h1v1H0zM2 9h1v1H2zM4 10h1v1H4zM1 11h1v1H1zM5 11h1v1H5zM3 12h1v1H3z" />
                      <path d="M9 9h1v1H9zM11 9h1v1h-1zM13 10h1v1h-1zM10 11h1v1h-1zM12 12h1v1h-1zM9 13h1v1H9z" />
                      <path d="M16 9h1v1h-1zM18 10h1v1h-1zM20 11h1v1h-1zM17 12h1v1h-1zM19 13h1v1h-1z" />
                      <path d="M9 16h1v1H9zM11 17h1v1h-1zM13 16h1v1h-1zM10 18h1v1h-1zM12 19h1v1h-1zM9 20h1v1H9z" />
                      <path d="M16 16h1v1h-1zM18 17h1v1h-1zM20 16h1v1h-1zM17 19h1v1h-1zM19 20h1v1h-1z" />
                    </g>
                  </svg>
                </div>
                <p className="qr-caption"><a href="#">Steam 모바일 앱을 사용하여 QR 코드로 로그인</a></p>
              </div>
            </form>

            <section className="join">
              <div className="join-left">
                <h2>Steam에 처음 오셨나요?</h2>
                <a href="#signup" className="btn-join" onClick={go("signup")}>가입하기</a>
              </div>
              <p className="join-right">
                무료로 쉽게 가입할 수 있습니다. 수천 종류의 게임을 전 세계 새로운 친구들과 함께 즐겨보세요.
                <a href="#" onClick={go("store")}>상점 둘러보기</a>
              </p>
            </section>
          </div>
        </div>
      </section>

      {/* ===== 가입 ===== */}
      <section id="signupView" className={view === "signup" ? "on" : ""}>
        <Tiles className="signup-bg" count={24} pool={pool} />
        <div className="signup-veil" />

        <div className="signup-inner">
          <div className="wrap">
            <h1 className="signup-title">계정 만들기</h1>

            <form className="signup-form" autoComplete="off" onSubmit={submitSignup}>
              <label className="su-label" htmlFor="suEmail">이메일 주소</label>
              <input className="su-input" type="email" id="suEmail" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} />

              <label className="su-label" htmlFor="suEmail2">이메일 주소 확인</label>
              <input className="su-input" type="email" id="suEmail2" value={suEmail2} onChange={(e) => setSuEmail2(e.target.value)} />

              <label className="su-label" htmlFor="suCountry">거주 국가</label>
              <select className="su-input su-select" id="suCountry" defaultValue="대한민국">
                <option>대한민국</option><option>미국</option><option>일본</option>
                <option>중국</option><option>독일</option><option>영국</option><option>캐나다</option>
              </select>

              <div className="su-captcha">
                <span
                  className={"su-box" + (captcha ? " on" : "")}
                  role="checkbox"
                  aria-checked={captcha}
                  tabIndex={0}
                  onClick={() => setCaptcha((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") { e.preventDefault(); setCaptcha((v) => !v); }
                  }}
                />
                <span className="txt">사람입니다</span>
                <span className="su-brand">
                  <span className="su-mark" />
                  <b>hCaptcha</b>
                  개인정보 보호 - 약관
                </span>
              </div>

              <label className="su-agree">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>본인은 만 13세 이상이며 <a href="#">Steam 이용 약관</a> 및 <a href="#">Valve 개인정보 처리방침</a>에 동의합니다.</span>
              </label>

              <button className="su-submit" type="submit">계속</button>
              <div className="signup-msg">{signupMsg}</div>
            </form>
          </div>
        </div>
      </section>

      {/* ===== 계정 만들기 (이메일 인증 다음 단계) ===== */}
      <section id="createView" className={view === "create" ? "on" : ""}>
        <Tiles className="create-bg" count={24} pool={pool} />
        <div className="create-veil" />

        <div className="create-inner">
          <div className="wrap">
            <h1 className="create-title">계정 만들기</h1>

            <form className="create-form" autoComplete="off" onSubmit={submitCreate}>
              <label className="cr-label" htmlFor="crName">Steam 계정 이름</label>
              <input className="cr-input" type="text" id="crName" autoComplete="username"
                value={crName} onChange={(e) => setCrName(e.target.value)} />
              <div className="cr-hint">영문/숫자만 사용, 6자 이상</div>

              <label className="cr-label" htmlFor="crPw">비밀번호 선택</label>
              <input className="cr-input" type="password" id="crPw" autoComplete="new-password"
                value={crPw} onChange={(e) => setCrPw(e.target.value)} />
              <div className="cr-hint">8자 이상</div>

              <label className="cr-label" htmlFor="crPw2">비밀번호 확인</label>
              <input className="cr-input" type="password" id="crPw2" autoComplete="new-password"
                value={crPw2} onChange={(e) => setCrPw2(e.target.value)} />

              <button className="cr-submit" type="submit" disabled={createBusy}>완료</button>
              <div className={"create-msg" + (createMsg?.ok ? " ok" : "")}>{createMsg?.text}</div>
            </form>
          </div>
        </div>
      </section>

      {/* ===== 완료 ===== */}
      <section id="doneView" className={view === "done" ? "on" : ""}>
        <Tiles className="done-bg" count={24} pool={pool} />
        <div className="done-veil" />
        <div className="done-inner">
          <div className="wrap">
            <h1>계정 생성 완료</h1>
            <p>{doneName ? `${doneName} 계정이 만들어졌습니다. 이제 로그인할 수 있습니다.` : "계정이 만들어졌습니다. 이제 로그인할 수 있습니다."}</p>
            <p className="note">*이 창을 닫으셔도 됩니다</p>
            <a className="btn-blue" href="#login" onClick={go("login")}>로그인하러 가기</a>
          </div>
        </div>
      </section>

      {/* ===== 이메일 인증 모달 ===== */}
      <div
        className={"verify-back" + (verifyEmail ? " on" : "")}
        onClick={(e) => { if (e.target === e.currentTarget) closeVerify(); }}
      >
        <div className="verify">
          <h3>이메일 주소 인증</h3>

          <div className="v-panel">
            <p className="v-msg">
              Steam에서 보내드린 이메일을 <b>{verifyEmail}</b>에서 확인하시고 계정 설정을 완료하세요.
            </p>
            <div className="v-bars" aria-hidden="true"><i /><i /><i /></div>
            <div className={"v-status" + (verified ? " done" : "")}>
              {verified ? "인증 완료" : "인증 대기 중..."}
            </div>
          </div>

          <p className="v-ask">이메일을 받지 못하셨나요?</p>
          <button className="v-toggle" type="button" onClick={() => setHelpOpen((v) => !v)}>
            {helpOpen ? "접기 ⌃" : "펼치기 ⌄"}
          </button>

          <div className={"v-help" + (helpOpen ? " on" : "")}>
            <p>이메일을 받지 못했다면, 아래의 문제 해결 절차를 따라 주세요.</p>
            <ol>
              <li>본인의 이메일 주소가 &lsquo;{verifyEmail}&rsquo;이 맞는지, 오타가 포함되어 있지는 않은지 확인해 주세요.</li>
              <li>&lsquo;steampowered.com&rsquo;에서 온 이메일이 스팸 또는 휴지통 폴더에 있는지 확인해 주세요.</li>
              <li>잠시만 기다려 주세요. 간혹 이메일 서버가 느려져 메일 수신에 다소 시간이 걸릴 수 있습니다.</li>
            </ol>
            <p>
              <button type="button" className="v-resend" onClick={resendVerify}>인증 메일 다시 보내기</button>
              {resendMsg && <span className="v-resend-msg"> {resendMsg}</span>}
            </p>
            <p>
              이메일 주소를 변경하려면{" "}
              <a href="#signup" onClick={(e) => { e.preventDefault(); closeVerify(); onView("signup"); }}>여기를 클릭</a>하세요.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
