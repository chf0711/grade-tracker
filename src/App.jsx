import React, { useState, useEffect, useMemo } from 'react';
// 確保安裝了這些套件: npm install recharts lucide-react firebase
// 注意：xlsx 套件將透過 CDN 動態載入，無需 npm install
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { BookOpen, Users, Search, Save, Plus, Check, TrendingUp, BarChart3, X, Lock, CloudDownload, LayoutDashboard, GraduationCap, Calendar, Clipboard, LogOut, AlertTriangle, UserPlus, Sparkles, Edit3, Quote, Loader2, RefreshCw, Trash2, Layers, PieChart, Trophy, Target, Clock, Timer, FileSpreadsheet } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

// --- Firebase Configuration Setup ---
const realFirebaseConfig = {
  apiKey: "AIzaSyChK1IiE6YhHZ_DdxXzpxi8vmBA9A9So9A",
  authDomain: "grade-tracker-9ccb3.firebaseapp.com",
  projectId: "grade-tracker-9ccb3",
  storageBucket: "grade-tracker-9ccb3.firebasestorage.app",
  messagingSenderId: "55920171494",
  appId: "1:55920171494:web:0529f931aaefd930f11e27"
};

// --- Firebase Initialization Logic ---
let app;
let auth;
let db;
let appId = 'grade-tracker-v1';

try {
  if (typeof __firebase_config !== 'undefined') {
    const config = JSON.parse(__firebase_config);
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    if (typeof __app_id !== 'undefined') appId = __app_id;
  } 
  else if (realFirebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
    if (!getApps().length) {
      app = initializeApp(realFirebaseConfig);
    } else {
      app = getApp();
    }
  } else {
    console.warn("Firebase not configured. Using mock mode or limited functionality.");
  }

  if (app) {
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

// --- FULL DATASET ---
const EXAM_DATES = [
  "04/12", "04/19", "04/26", "05/03", "05/10", "05/17", "05/24", "06/07", "06/14",
  "06/21", "06/28", "06/29", "07/12", "07/19", "07/21", "07/26", "08/02", "08/09", // Phase 1
  "08/16", "08/30", "09/06", "09/13", "09/20", "09/27", "09/29", "10/04", 
  "10/11", "10/18", "10/25", "11/01", "11/08", "11/15", "11/29", "12/06", "12/13", "12/20", // Phase 2
  // Mock Phase (10 Weeks)
  "12/27", "01/03", "01/10", "01/17", "01/24", "01/31", "02/07", "02/14", "02/21", "02/28"
];

// --- Custom Date Sort Helper ---
const customDateSort = (a, b) => {
    const [m1, d1] = a.split('/').map(Number);
    const [m2, d2] = b.split('/').map(Number);
    const m1Adj = m1 < 4 ? m1 + 12 : m1;
    const m2Adj = m2 < 4 ? m2 + 12 : m2;
    if (m1Adj !== m2Adj) return m1Adj - m2Adj;
    return d1 - d2;
};

// --- Phase Configuration ---
const PHASES = [
    { id: 'p1', name: '第一階段 (1~18週)', range: [0, 18] },
    { id: 'p2', name: '第二階段 (19~36週)', range: [18, 36] },
    { id: 'mock', name: '模考衝刺班 (10週)', range: [36, 100] } 
];

// --- Colors Update ---
const COLORS = {
    total: { hex: '#10b981', tailwind: 'emerald', label: '總分' },
    chi:   { hex: '#ef4444', tailwind: 'red',     label: '國文' }, 
    eng:   { hex: '#8b5cf6', tailwind: 'violet',  label: '英文' }, 
    math:  { hex: '#3b82f6', tailwind: 'blue',    label: '數學' }, 
    avg:   { hex: '#94a3b8', tailwind: 'slate',   label: '班平均' } 
};

const f1 = (v) => {
    if (v === '' || v === undefined || v === null) return '';
    const num = parseFloat(v);
    return isNaN(num) ? '' : num.toFixed(1);
};

// 用於渲染單一圖表的元件
const SingleSubjectChart = ({ data, subjectKey, avgKey, colorKey, title, domain }) => (
    <div className="mb-6">
        <div className="h-56 md:h-64 w-full -ml-2">
          <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'}} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10} 
                    interval="preserveStartEnd" 
                  />
                  <YAxis 
                    domain={domain} 
                    tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'}} 
                    tickLine={false} 
                    axisLine={false} 
                    width={28} 
                  />
                  <Tooltip 
                      contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', 
                          padding: '12px 16px',
                          fontSize: '13px',
                          fontWeight: '500',
                          backgroundColor: 'rgba(255, 255, 255, 0.95)'
                      }} 
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}/>
                  <Line name="班平均" type="monotone" dataKey={avgKey} stroke="#94a3b8" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#94a3b8' }} strokeDasharray="5 5" isAnimationActive={false} />
                  <Line name={title} type="monotone" dataKey={subjectKey} stroke={COLORS[colorKey].hex} strokeWidth={3} activeDot={{ r: 6, fill: COLORS[colorKey].hex, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={true} animationDuration={1500}/>
              </LineChart>
          </ResponsiveContainer>
        </div>
    </div>
);

// 分佈圖元件
const DistributionChart = ({ data, colorKey }) => (
    <div className="h-48 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                <XAxis 
                    dataKey="range" 
                    tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={5}
                />
                <YAxis 
                    tick={{fontSize: 10, fill: '#64748b'}} 
                    tickLine={false} 
                    axisLine={false} 
                    allowDecimals={false}
                />
                <Tooltip 
                    cursor={false} // 修正：移除背景游標，解決圓角後的直角陰影問題
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                />
                <Bar dataKey="count" name="人數" radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isMyRange ? COLORS[colorKey].hex : '#cbd5e1'} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>
);

const RAW_STUDENT_RECORDS = [];

// --- 倒數計時元件 ---
const ExamCountdown = () => {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const targetDate = new Date('2026-03-14T08:00:00');
        const calculateTimeLeft = () => {
            const now = new Date();
            const difference = targetDate - now;
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                setTimeLeft({ days, hours, minutes, seconds });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };
        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000); 
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex items-center gap-2 mt-4 px-3 py-1.5 rounded-xl bg-white/60 border border-white/50 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.05)] backdrop-blur-md group hover:bg-white/80 transition-all duration-500 animate-in fade-in slide-in-from-bottom-2 justify-center">
            <div className="flex items-center gap-1.5 text-emerald-600/80">
                <Target className="w-3.5 h-3.5" />
            </div>
            <div className="h-5 w-[1px] bg-gradient-to-b from-slate-100 via-slate-200 to-slate-100 mx-0.5"></div>
            <div className="flex items-baseline gap-1 text-slate-700 font-mono leading-none">
                <div className="flex flex-col items-center">
                    <span className="text-base font-black tracking-tight text-slate-700">{timeLeft.days}</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider scale-90">Days</span>
                </div>
                <span className="text-slate-300 text-xs relative -top-1.5">:</span>
                <div className="flex flex-col items-center min-w-[1.2rem]">
                    <span className="text-base font-black tracking-tight text-slate-700">{String(timeLeft.hours).padStart(2, '0')}</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider scale-90">Hr</span>
                </div>
                <span className="text-slate-300 text-xs relative -top-1.5">:</span>
                <div className="flex flex-col items-center min-w-[1.2rem]">
                    <span className="text-base font-black tracking-tight text-slate-700">{String(timeLeft.minutes).padStart(2, '0')}</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider scale-90">Min</span>
                </div>
                <span className="text-slate-300 text-xs relative -top-1.5">:</span>
                <div className="flex flex-col items-center min-w-[1.2rem]">
                    <span className="text-base font-black tracking-tight bg-gradient-to-br from-emerald-500 to-teal-500 bg-clip-text text-transparent">{String(timeLeft.seconds).padStart(2, '0')}</span>
                    <span className="text-[7px] font-bold text-emerald-500/60 uppercase tracking-wider scale-90">Sec</span>
                </div>
            </div>
        </div>
    );
};

export default function GradeTracker() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('landing'); 
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('teacher_auth') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);
  
  const [studentName, setStudentName] = useState('');
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [grades, setGrades] = useState({});
  const [classAverages, setClassAverages] = useState({}); 
  const [availableDates, setAvailableDates] = useState(EXAM_DATES);
  const [newDateInput, setNewDateInput] = useState('');
  
  const [statusMsg, setStatusMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentIdInput, setNewStudentIdInput] = useState('');
  const [showAvgModal, setShowAvgModal] = useState(false);
  
  const [teacherViewMode, setTeacherViewMode] = useState('single');
  const [batchDate, setBatchDate] = useState('');
  const [allStudentsData, setAllStudentsData] = useState([]); 
  const [cachedClassData, setCachedClassData] = useState([]); 
  
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [viewData, setViewData] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [activeTab, setActiveTab] = useState('total');
  const [activePhase, setActivePhase] = useState('p2');

  const [statsModalData, setStatsModalData] = useState(null);
  const [statsActiveTab, setStatsActiveTab] = useState('total');

  const [xlsxLoaded, setXlsxLoaded] = useState(false);

  useEffect(() => {
    // Dynamically load XLSX script
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => setXlsxLoaded(true);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) return;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
           await signInWithCustomToken(auth, __initial_auth_token);
        } else {
           await signInAnonymously(auth);
        }
      } catch (e) { console.error(e); }
    };
    
    if (auth) {
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, (u) => {
          setUser(u);
          if (u) {
              loadDates();
              loadClassAverages();
          }
        });
        return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
      if (availableDates.length > 0 && !batchDate) {
          setBatchDate(availableDates[availableDates.length - 1]);
      }
  }, [availableDates]);

  // --- Helpers ---
  const loadDates = async () => {
      if (!db) return;
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'));
          if (docSnap.exists() && docSnap.data().list) {
              setAvailableDates(docSnap.data().list.sort(customDateSort));
          } else {
             const initialDates = [...EXAM_DATES].sort(customDateSort);
             await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: initialDates }, { merge: true });
             setAvailableDates(initialDates);
          }
      } catch(e) {}
  };

  const addDate = async () => {
      if (!newDateInput || availableDates.includes(newDateInput)) return;
      const newList = [...availableDates, newDateInput].sort(customDateSort);
      setAvailableDates(newList);
      setNewDateInput('');
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已新增日期: ${newDateInput}`); setTimeout(() => setStatusMsg(''), 2000);
  };

  const localComputedAverages = useMemo(() => {
      const avgs = {};
      availableDates.forEach(date => {
          let t=0, c=0, e=0, m=0, count=0;
          RAW_STUDENT_RECORDS.forEach(s => {
              const grades = s.grades && s.grades[date];
              if (Array.isArray(grades) && grades.length >= 3) {
                  const math = parseFloat(grades[0]) || 0;
                  const eng = parseFloat(grades[1]) || 0;
                  const chi = parseFloat(grades[2]) || 0;
                  const total = math + eng + chi;
                  if(total > 0) { t += total; m += math; e += eng; c += chi; count++; }
              }
          });
          if(count > 0) avgs[date] = { total: (t/count).toFixed(1), chi: (c/count).toFixed(1), eng: (e/count).toFixed(1), math: (m/count).toFixed(1) };
      });
      return avgs;
  }, [availableDates]);

  const loadClassAverages = async () => {
      if (!db) { setClassAverages(localComputedAverages); return; }
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v17'));
          let dbAverages = {};
          if (docSnap.exists()) dbAverages = docSnap.data().averages || {};
          setClassAverages({ ...localComputedAverages, ...dbAverages });
      } catch (e) { setClassAverages(localComputedAverages); }
  };

  const handleManualAverageChange = (date, subject, value) => {
      setClassAverages(prev => {
          const currentAvg = prev[date] || { chi: '', eng: '', math: '', total: '' };
          const updatedAvg = { ...currentAvg, [subject]: value };
          if (subject !== 'total') {
              updatedAvg.total = calculateTotal(
                  subject === 'chi' ? value : updatedAvg.chi,
                  subject === 'eng' ? value : updatedAvg.eng,
                  subject === 'math' ? value : updatedAvg.math
              );
          }
          return { ...prev, [date]: updatedAvg };
      });
  };

  const saveManualClassAverages = async () => {
      if (!db) return;
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v17'), { averages: classAverages }, { merge: true });
          setStatusMsg("班平均儲存成功！"); setTimeout(() => setStatusMsg(''), 2000); setShowAvgModal(false);
      } catch (e) { setStatusMsg("儲存失敗"); }
  };

  const handleDeleteDate = (dateToDelete) => setDeleteTarget(dateToDelete);

  const confirmDeleteDate = async () => {
      if (!deleteTarget) return;
      const newList = availableDates.filter(d => d !== deleteTarget);
      setAvailableDates(newList);
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已刪除日期: ${deleteTarget}`); setTimeout(() => setStatusMsg(''), 2000); setDeleteTarget(null);
  };

  const handleLoginSubmit = () => {
      if (passwordInput === 'Ben110705') { 
          setIsAuthenticated(true); localStorage.setItem('teacher_auth', 'true'); setMode('teacher'); loadAllStudents();
      } else { setLoginError(true); }
  };

  const handleLogout = () => {
      setIsAuthenticated(false); localStorage.removeItem('teacher_auth'); setMode('landing');
  };

  const calculateTotal = (chi, eng, math) => {
      const c = parseFloat(chi) || 0; const e = parseFloat(eng) || 0; const m = parseFloat(math) || 0;
      if (chi === '' && eng === '' && math === '') return '';
      return (c + e + m).toFixed(1);
  };

  const loadAllStudents = async () => {
      setLoading(true);
      try {
          let studentsMap = {};
          RAW_STUDENT_RECORDS.forEach(s => { studentsMap[s.id] = { ...s, grades: normalizeGrades(s.grades) }; });
          if (db) {
              const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
              querySnapshot.forEach(doc => {
                  const data = doc.data();
                  if (studentsMap[data.id]) { studentsMap[data.id] = { ...studentsMap[data.id], ...data, grades: { ...studentsMap[data.id].grades, ...data.grades } }; } 
                  else { studentsMap[data.id] = data; }
              });
          }
          const sortedStudents = Object.values(studentsMap).sort((a,b) => a.id.localeCompare(b.id));
          setAllStudentsData(sortedStudents);
      } catch (e) { console.error("Load all students error:", e); }
      setLoading(false);
  };

  const normalizeGrades = (grades) => {
      if (!grades) return {};
      const normalized = {};
      Object.keys(grades).forEach(date => {
          const g = grades[date];
          if (Array.isArray(g)) { normalized[date] = { math: g[0]||0, eng: g[1]||0, chi: g[2]||0, total: (g[0]||0)+(g[1]||0)+(g[2]||0) }; } 
          else { normalized[date] = g; }
      });
      return normalized;
  };

  const loadStudentForTeacher = async (id) => {
    if (!user) return;
    setLoading(true);
    try {
      let data = null;
      if (db) {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${id}`));
          if (docSnap.exists()) data = docSnap.data();
      }
      if (data) {
        setCurrentStudentId(data.id); setStudentName(data.name);
        let loadedGrades = data.grades || {};
        availableDates.forEach(d => { if (!loadedGrades[d]) loadedGrades[d] = { chi: '', eng: '', math: '', total: '' }; });
        setGrades(loadedGrades); setStatusMsg(`已載入：${data.name}`);
      } else {
        setCurrentStudentId(id); setStudentName('');
        const gradesObj = {}; availableDates.forEach(d => gradesObj[d] = { chi: '', eng: '', math: '', total: '' });
        setGrades(gradesObj); setStatusMsg('新學生模式');
      }
    } catch (e) { setStatusMsg('讀取錯誤'); }
    setLoading(false);
  };

  const handleAddNewStudent = () => {
      if(newStudentIdInput.trim()) {
          loadStudentForTeacher(newStudentIdInput.toUpperCase().trim());
          setShowAddStudentModal(false); setNewStudentIdInput(''); setTeacherViewMode('single');
      }
  };

  const handleGradeChange = (dateKey, subject, value) => {
    setGrades(prev => {
        const currentData = prev[dateKey] || { chi: '', eng: '', math: '', total: '' };
        const updatedData = { ...currentData, [subject]: value };
        if (subject !== 'total') updatedData.total = calculateTotal(subject==='chi'?value:updatedData.chi, subject==='eng'?value:updatedData.eng, subject==='math'?value:updatedData.math);
        return { ...prev, [dateKey]: updatedData };
    });
  };

  const handleBatchGradeChange = (studentId, subject, value) => {
      setAllStudentsData(prev => prev.map(s => {
          if (s.id !== studentId) return s;
          const currentGrades = s.grades || {};
          const currentDateGrades = currentGrades[batchDate] || { chi: '', eng: '', math: '', total: '' };
          const updatedDateGrades = { ...currentDateGrades, [subject]: value };
          if (subject !== 'total') updatedDateGrades.total = calculateTotal(subject==='chi'?value:updatedDateGrades.chi, subject==='eng'?value:updatedDateGrades.eng, subject==='math'?value:updatedDateGrades.math);
          return { ...s, grades: { ...currentGrades, [batchDate]: updatedDateGrades } };
      }));
  };

  const handleExcelUpload = (e) => {
    if (!xlsxLoaded) {
      setStatusMsg("Excel 元件尚未載入完成，請稍後");
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        // Use window.XLSX loaded from CDN
        const wb = window.XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Read raw values
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        // Remove header row if present
        let startIndex = 0;
        if (data[0] && typeof data[0][0] === 'string' && (data[0][0].includes('學號') || data[0][0].includes('ID'))) {
          startIndex = 1;
        }

        const newStudentsMap = { ...allStudentsData.reduce((acc, s) => ({...acc, [s.id]: s}), {}) };
        const newDates = new Set(availableDates);
        let importCount = 0;

        for (let i = startIndex; i < data.length; i++) {
          const row = data[i];
          if (!row[0]) continue; 

          const rawId = String(row[0]).toUpperCase().trim();
          const rawName = row[1] ? String(row[1]).trim() : '';
          const rawDate = row[2];
          const chi = row[3];
          const eng = row[4];
          const math = row[5];
          
          // Date Formatting: '0103' or 103 -> '01/03'
          let dateStr = '';
          if (rawDate) {
               let dString = String(rawDate).padStart(4, '0'); 
               if (dString.length === 4) {
                   dateStr = `${dString.slice(0, 2)}/${dString.slice(2)}`;
               } else {
                   dateStr = String(rawDate); 
               }
          }

          if (!dateStr) continue;

          if (!newDates.has(dateStr)) {
              newDates.add(dateStr);
          }

          // Create or Update Student
          let student = newStudentsMap[rawId];
          if (!student) {
              student = { id: rawId, name: rawName || '未命名', grades: {} };
              newStudentsMap[rawId] = student;
          } else {
              if (rawName) student.name = rawName;
          }

          if (!student.grades) student.grades = {};
          
          const totalVal = calculateTotal(chi, eng, math);
          
          student.grades[dateStr] = {
              chi: String(chi || ''),
              eng: String(eng || ''),
              math: String(math || ''),
              total: totalVal
          };
          
          importCount++;
        }

        const sortedDates = Array.from(newDates).sort(customDateSort);
        setAvailableDates(sortedDates);
        
        // Save new dates list to DB immediately
        if (db) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: sortedDates }, { merge: true });
        }

        const sortedStudents = Object.values(newStudentsMap).sort((a,b) => a.id.localeCompare(b.id));
        setAllStudentsData(sortedStudents);
        
        setStatusMsg(`成功匯入 ${importCount} 筆成績！請記得點擊「儲存全班」以同步雲端。`);
      } catch (error) {
        console.error("Excel import error:", error);
        setStatusMsg("匯入失敗，請檢查檔案格式");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleKeyDown = (e, studentIndex, subject) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          let nextStudentIndex = studentIndex;
          let nextSubject = subject;
          const subjects = ['chi', 'eng', 'math'];
          const subjectIndex = subjects.indexOf(subject);
          
          if (e.key === 'ArrowUp') nextStudentIndex = Math.max(0, studentIndex - 1);
          else if (e.key === 'ArrowDown') nextStudentIndex = Math.min(allStudentsData.length - 1, studentIndex + 1);
          else if (e.key === 'ArrowLeft' && subjectIndex > 0) nextSubject = subjects[subjectIndex - 1];
          else if (e.key === 'ArrowRight' && subjectIndex < 2) nextSubject = subjects[subjectIndex + 1];
          
          const nextInputId = `cell-${nextStudentIndex}-${nextSubject}`;
          const nextInput = document.getElementById(nextInputId);
          if (nextInput) { nextInput.focus(); nextInput.select(); }
      }
  };

  const handlePaste = (e, startStudentIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/);
      const subjects = ['chi', 'eng', 'math'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      
      if (rows.length === 0) return;
      
      setAllStudentsData(prev => {
          const newData = [...prev];
          let updated = false;
          rows.forEach((row, rIndex) => {
              const studentIndex = startStudentIndex + rIndex;
              if (studentIndex >= newData.length) return;
              const cols = row.split('\t');
              const student = { ...newData[studentIndex] };
              const currentGrades = student.grades || {};
              const currentDateGrades = { ...(currentGrades[batchDate] || { chi: '', eng: '', math: '', total: '' }) };
              let rowUpdated = false;
              cols.forEach((val, cIndex) => {
                  const subjectIndex = startSubjectIndex + cIndex;
                  if (subjectIndex >= 3) return;
                  const subject = subjects[subjectIndex];
                  const cleanVal = val.trim();
                  currentDateGrades[subject] = cleanVal;
                  rowUpdated = true;
              });
              if (rowUpdated) {
                  currentDateGrades.total = calculateTotal(currentDateGrades.chi, currentDateGrades.eng, currentDateGrades.math);
                  student.grades = { ...currentGrades, [batchDate]: currentDateGrades };
                  newData[studentIndex] = student;
                  updated = true;
              }
          });
          if(updated) { setStatusMsg(`已貼上 ${rows.length} 筆資料`); setTimeout(() => setStatusMsg(''), 2000); }
          return newData;
      });
  };

  const handleSingleKeyDown = (e, dateIndex, subject) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const subjects = ['chi', 'eng', 'math'];
          let nextDateIndex = dateIndex;
          let nextSubject = subject;
          const subjectIndex = subjects.indexOf(subject);
          const maxDateIndex = availableDates.length - 1;

          if (e.key === 'ArrowUp') nextDateIndex = Math.max(0, dateIndex - 1);
          else if (e.key === 'ArrowDown') nextDateIndex = Math.min(maxDateIndex, dateIndex + 1);
          else if (e.key === 'ArrowLeft' && subjectIndex > 0) nextSubject = subjects[subjectIndex - 1];
          else if (e.key === 'ArrowRight' && subjectIndex < 2) nextSubject = subjects[subjectIndex + 1];

          const nextInputId = `single-${nextDateIndex}-${nextSubject}`;
          const nextInput = document.getElementById(nextInputId);
          if (nextInput) { nextInput.focus(); nextInput.select(); }
      }
  };

  const handleSinglePaste = (e, startDateIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/); 
      const subjects = ['chi', 'eng', 'math'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      const reversedDates = [...availableDates].sort(customDateSort).reverse();

      setGrades(prev => {
          const newGrades = { ...prev };
          let updated = false;
          rows.forEach((row, rIndex) => {
              const dateIndex = startDateIndex + rIndex;
              if (dateIndex >= reversedDates.length) return;
              const targetDate = reversedDates[dateIndex];
              const cols = row.split('\t');
              const currentData = { ...(newGrades[targetDate] || { chi: '', eng: '', math: '', total: '' }) };
              let rowUpdated = false;
              cols.forEach((val, cIndex) => {
                  const subjectIndex = startSubjectIndex + cIndex;
                  if (subjectIndex >= 3) return;
                  const subject = subjects[subjectIndex];
                  currentData[subject] = val.trim();
                  rowUpdated = true;
              });
              if (rowUpdated) {
                  currentData.total = calculateTotal(currentData.chi, currentData.eng, currentData.math);
                  newGrades[targetDate] = currentData;
                  updated = true;
              }
          });
          if (updated) { setStatusMsg(`已貼上 ${rows.length} 筆資料`); setTimeout(() => setStatusMsg(''), 2000); }
          return newGrades;
      });
  };

  const handleAvgKeyDown = (e, dateIndex, subject) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const subjects = ['chi', 'eng', 'math', 'total'];
          let nextDateIndex = dateIndex;
          let nextSubject = subject;
          const subjectIndex = subjects.indexOf(subject);
          const maxDateIndex = availableDates.length - 1;

          if (e.key === 'ArrowUp') nextDateIndex = Math.max(0, dateIndex - 1);
          else if (e.key === 'ArrowDown') nextDateIndex = Math.min(maxDateIndex, dateIndex + 1);
          else if (e.key === 'ArrowLeft' && subjectIndex > 0) nextSubject = subjects[subjectIndex - 1];
          else if (e.key === 'ArrowRight' && subjectIndex < 3) nextSubject = subjects[subjectIndex + 1];

          const nextInputId = `avg-${nextDateIndex}-${nextSubject}`;
          const nextInput = document.getElementById(nextInputId);
          if (nextInput) { nextInput.focus(); nextInput.select(); }
      }
  };

  const handleAvgPaste = (e, startDateIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/);
      const subjects = ['chi', 'eng', 'math', 'total'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      const reversedDates = [...availableDates].sort(customDateSort).reverse();

      setClassAverages(prev => {
          const newAvgs = { ...prev };
          let updated = false;
          rows.forEach((row, rIndex) => {
              const dateIndex = startDateIndex + rIndex;
              if (dateIndex >= reversedDates.length) return;
              const targetDate = reversedDates[dateIndex];
              const cols = row.split('\t');
              const currentData = { ...(newAvgs[targetDate] || { chi: '', eng: '', math: '', total: '' }) };
              let rowUpdated = false;
              cols.forEach((val, cIndex) => {
                  const subjectIndex = startSubjectIndex + cIndex;
                  if (subjectIndex >= 4) return;
                  const subject = subjects[subjectIndex];
                  if (subject !== 'total') {
                      currentData[subject] = val.trim();
                      rowUpdated = true;
                  }
              });
              if (rowUpdated) {
                  currentData.total = calculateTotal(currentData.chi, currentData.eng, currentData.math);
                  newAvgs[targetDate] = currentData;
                  updated = true;
              }
          });
          if (updated) { setStatusMsg(`已貼上 ${rows.length} 筆資料`); setTimeout(() => setStatusMsg(''), 2000); }
          return newAvgs;
      });
  };

  const handleDeleteStudent = () => { if (currentStudentId) setStudentToDelete({ id: currentStudentId, name: studentName }); };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
        if (db) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${studentToDelete.id}`));
        setAllStudentsData(prev => prev.filter(s => s.id !== studentToDelete.id));
        setCurrentStudentId(null); setStudentName(''); setGrades({});
        setStatusMsg(`已刪除學生`); setTimeout(() => setStatusMsg(''), 2000); setStudentToDelete(null);
    } catch (e) { setStatusMsg("刪除失敗"); }
  };

  const handleSaveGrades = async () => {
    if (!user || !currentStudentId) return;
    if (!studentName.trim()) { setStatusMsg('請輸入姓名'); return; }
    setStatusMsg('儲存中...');
    try {
      if (db) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${currentStudentId}`), { 
              id: currentStudentId, name: studentName, grades: grades, lastUpdated: new Date().toISOString()
          }, { merge: true });
      }
      setAllStudentsData(prev => {
          const exists = prev.find(s => s.id === currentStudentId);
          if(exists) return prev.map(s => s.id === currentStudentId ? { ...s, name: studentName, grades } : s);
          return [...prev, { id: currentStudentId, name: studentName, grades }].sort((a,b) => a.id.localeCompare(b.id));
      });
      setStatusMsg('儲存成功'); setTimeout(() => setStatusMsg(''), 2000);
    } catch (e) { setStatusMsg('儲存失敗'); }
  };

  const handleSaveBatchGrades = async () => {
      setStatusMsg("批次儲存中...");
      try {
          if (db) {
              const batchPromises = allStudentsData.map(student => {
                  return setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${student.id}`), {
                      id: student.id, name: student.name, grades: student.grades, lastUpdated: new Date().toISOString()
                  }, { merge: true });
              });
              await Promise.all(batchPromises);
              setStatusMsg("全班成績儲存成功！"); setTimeout(() => setStatusMsg(''), 2000);
          }
      } catch (e) { setStatusMsg("儲存失敗"); }
  };

  // --- 家長查詢邏輯 ---
  const handleParentSearch = async () => {
    if (!user || !searchId.trim()) return;
    setSearchError(''); setViewData(null); setLoading(true);
    try {
      let data = null;
      let fullClassData = [];

      if (db) {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${searchId.toUpperCase()}`);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
              data = docSnap.data();
              if (cachedClassData.length > 0) {
                  fullClassData = cachedClassData;
              } else {
                  const qSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
                  qSnap.forEach(d => fullClassData.push(d.data()));
                  setCachedClassData(fullClassData);
              }
          }
      }

      if (data) {
        const allChartData = [];
        const sortedDates = [...availableDates].sort(customDateSort); 

        for (const date of sortedDates) {
          const weekData = data.grades ? data.grades[date] : null;
          const avgData = classAverages[date] || {};
          
          if (weekData && weekData.total) {
             const t = parseFloat(weekData.total);
             if (!isNaN(t) && t > 0) {
                 allChartData.push({
                     date,
                     total: t,
                     chi: parseFloat(weekData.chi) || 0,
                     eng: parseFloat(weekData.eng) || 0,
                     math: parseFloat(weekData.math) || 0,
                     avgTotal: parseFloat(avgData.total) || null,
                     avgChi: parseFloat(avgData.chi) || null,
                     avgEng: parseFloat(avgData.eng) || null,
                     avgMath: parseFloat(avgData.math) || null
                 });
             }
          }
        }
        
        const avg = allChartData.length > 0 ? (allChartData.reduce((a,b)=>a+b.total,0)/allChartData.length).toFixed(1) : 0;
        setViewData({ ...data, chartData: allChartData, average: avg });
      } else { setSearchError('查無此學號'); }
    } catch (e) { console.error(e); setSearchError('系統忙碌，請稍後再試'); }
    setLoading(false);
  };

  const getPhaseData = (fullData) => {
      if (!fullData) return [];
      const currentPhaseConfig = PHASES.find(p => p.id === activePhase) || PHASES[0];
      const [start, end] = currentPhaseConfig.range;
      const sortedAvailable = [...availableDates].sort(customDateSort);
      const targetDates = sortedAvailable.slice(start, end);
      return fullData.filter(d => targetDates.includes(d.date));
  };

  const calculateRank = (date, subject, myScore) => {
      if (!cachedClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';

      const scores = cachedClassData.map(s => {
          const g = s.grades?.[date];
          if (!g) return null;
          const val = parseFloat(g[subject]);
          return isNaN(val) ? null : val;
      }).filter(v => v !== null);

      scores.sort((a, b) => b - a);
      const rank = scores.indexOf(myVal) + 1;
      return rank > 0 ? rank : '-';
  };

  const calculateDistribution = (date, subject, myScore) => {
      if (!cachedClassData.length) return [];
      
      const ranges = subject === 'total' 
         ? [290, 280, 270, 260, 250, 240, 230, 200, 0] 
         : [100, 90, 80, 70, 60, 0];

      const myVal = parseFloat(myScore);
      
      const buckets = ranges.slice(0, ranges.length - 1).map((r, i) => {
          const nextR = ranges[i+1];
          let label = `${r}`;
          if (subject === 'total') {
              if (r === 290) label = `290+`;
              else if (nextR === 0) label = `<200`; 
              else label = `${r}~${nextR + (nextR===200?0:1)}`; 
          } else {
              if (r === 100) return null; 
          }
          return { min: r, max: 999, count: 0, label, isMyRange: false };
      }).filter(b => b);

      if (subject !== 'total') {
          const simpleRanges = [90, 80, 70, 60, 0];
          const newBuckets = simpleRanges.map(min => {
              let label = `${min}+`;
              if (min === 0) label = '<60';
              else if (min === 90) label = '90-100';
              else label = `${min}-${min+9}`;
              return { min, max: min === 90 ? 300 : min + 9, count: 0, label, isMyRange: false };
          });
          buckets.length = 0; buckets.push(...newBuckets);
      } else {
          const totalRanges = [290, 280, 270, 260, 250, 240, 230, 200, 0];
           const newBuckets = totalRanges.map((min, idx) => {
              let label = '';
              let max = 999;
              if (min === 290) { label = '290+'; }
              else if (min === 0) { label = '<200'; max = 199; }
              else { 
                  max = totalRanges[idx-1] - 1; 
                  label = `${min}-${max}`;
              }
              return { min, max, count: 0, label, isMyRange: false };
           });
           buckets.length = 0; buckets.push(...newBuckets);
      }

      cachedClassData.forEach(s => {
          const g = s.grades?.[date];
          if (!g) return;
          const val = parseFloat(g[subject]);
          if (isNaN(val)) return;

          const bucket = buckets.find(b => val >= b.min && val <= b.max);
          if (bucket) bucket.count++;
      });

      if (!isNaN(myVal)) {
          const myBucket = buckets.find(b => myVal >= b.min && myVal <= b.max);
          if (myBucket) myBucket.isMyRange = true;
      }
      return buckets.map(b => ({ range: b.label, count: b.count, isMyRange: b.isMyRange }));
  };

  const openStatsModal = (date, grades) => {
      const stats = {
          date,
          total: calculateDistribution(date, 'total', grades.total),
          chi: calculateDistribution(date, 'chi', grades.chi),
          eng: calculateDistribution(date, 'eng', grades.eng),
          math: calculateDistribution(date, 'math', grades.math),
          myGrades: grades
      };
      setStatsModalData(stats);
  };

  if (!user && !db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono">系統初始化中...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono">系統連線中...</div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-700 selection:bg-emerald-100 pb-20">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-30 border-b border-white/20 shadow-sm transition-all duration-300">
        <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer active:scale-95 transition" onClick={() => setMode('landing')}>
            <div className="bg-gradient-to-br from-emerald-400 to-teal-600 text-white p-2.5 rounded-2xl shadow-lg shadow-emerald-200/50"><GraduationCap className="h-5 w-5" /></div>
            <div>
                <h1 className="text-xl font-black tracking-tight text-slate-800 leading-none">
                    2025-26<br className="block sm:hidden" />六私A班
                </h1>
                <p className="text-[11px] text-slate-500 font-bold tracking-widest uppercase mt-0.5">Learning Tracker</p>
            </div>
          </div>
          <div className="flex bg-slate-100/50 p-1 rounded-full items-center border border-white/50 backdrop-blur-sm">
            <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode.includes('teacher') ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{isAuthenticated ? '老師後台' : '老師登入'}</button>
            <button onClick={() => setMode('parent')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'parent' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>家長查詢</button>
            {isAuthenticated && (
                <button onClick={handleLogout} className="ml-2 p-1.5 text-slate-400 hover:text-red-500 transition-colors"><LogOut className="w-4 h-4"/></button>
            )}
          </div>
        </div>
      </header>

      <main className="pt-24 px-4 max-w-4xl mx-auto min-h-[calc(100vh-6rem)]">
        {mode === 'landing' && (
          <div className="flex flex-col items-center justify-center py-10 md:py-20 space-y-6 md:space-y-12 animate-in fade-in zoom-in duration-700">
            <div className="text-center space-y-6 md:space-y-8 max-w-lg">
                <div className="inline-flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-white to-slate-100 rounded-full shadow-2xl shadow-emerald-100 mb-2 ring-4 md:ring-8 ring-white"><Sparkles className="w-8 h-8 md:w-12 md:h-12 text-emerald-500" /></div>
                
                <div className="flex flex-col items-center justify-center">
                    <p className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">Making Progress Visible</p>
                    <ExamCountdown />
                </div>
            </div>
            <div className="w-full max-w-sm space-y-4 pt-4">
               <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className="group w-full bg-gradient-to-br from-white to-slate-100 p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white hover:border-emerald-100 flex items-center gap-5 hover:scale-[1.02] transition-all duration-300 active:scale-95">
                  <div className="bg-emerald-50 group-hover:bg-emerald-100 w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-600 transition-colors"><LayoutDashboard className="w-7 h-7" /></div>
                  <div className="text-left"><h3 className="text-xl font-bold text-slate-800">老師專用通道</h3><p className="text-xs text-slate-400 mt-1 font-medium">成績管理與班級設定</p></div>
               </button>
               <button onClick={() => setMode('parent')} className="group w-full bg-gradient-to-br from-white to-slate-100 p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white hover:border-blue-100 flex items-center gap-5 hover:scale-[1.02] transition-all duration-300 active:scale-95">
                  <div className="bg-blue-50 group-hover:bg-blue-100 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-600 transition-colors"><BarChart3 className="w-7 h-7" /></div>
                  <div className="text-left"><h3 className="text-xl font-bold text-slate-800">家長查詢入口</h3><p className="text-xs text-slate-400 mt-1 font-medium">輸入學號查看分析報告</p></div>
               </button>
            </div>
          </div>
        )}

        {mode === 'teacher_login' && (
            <div className="flex items-center justify-center min-h-[60vh] px-4 animate-in fade-in">
                <div className="bg-gradient-to-br from-white/90 to-slate-100/90 backdrop-blur-xl p-6 md:p-10 rounded-[2.5rem] shadow-2xl shadow-emerald-100/50 w-full max-w-sm text-center border border-white mx-auto">
                    <div className="inline-flex p-4 bg-emerald-50 rounded-2xl mb-8 text-emerald-600"><Lock className="w-8 h-8" /></div>
                    <h2 className="text-2xl font-extrabold text-slate-800 mb-8 tracking-tight">身份驗證</h2>
                    <input type="password" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setLoginError(false); }} onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} className="w-full p-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-emerald-200 rounded-2xl text-center text-xl font-bold tracking-[0.2em] text-slate-800 outline-none transition-all mb-4 placeholder:tracking-normal" placeholder="" autoFocus />
                    {loginError && <p className="text-red-500 text-xs font-bold mb-4 animate-pulse">密碼錯誤</p>}
                    <button onClick={handleLoginSubmit} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-4 rounded-2xl font-bold text-lg hover:shadow-lg hover:shadow-emerald-200/50 transition-all active:scale-95">確認登入</button>
                </div>
            </div>
        )}

        {mode === 'teacher' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className="bg-gradient-to-br from-white to-slate-50 p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 text-slate-800 font-bold"><Calendar className="w-5 h-5 text-emerald-500"/>管理日期</div>
                        <div className="flex gap-2">
                             <input type="text" placeholder="MM/DD" className="w-24 p-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-center font-bold outline-none focus:border-emerald-400 transition-colors tracking-widest" value={newDateInput} onChange={e=>setNewDateInput(e.target.value)} />
                             <button onClick={addDate} className="bg-slate-800 text-white px-3 rounded-xl hover:bg-black transition-colors"><Plus className="w-4 h-4"/></button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-100">
                        {[...availableDates].sort(customDateSort).reverse().map(d => (
                            <div key={d} className="flex items-center bg-white px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 shadow-sm border border-slate-100">
                                {d} <button onClick={() => handleDeleteDate(d)} className="ml-2 text-slate-300 hover:text-red-500 transition-colors"><X className="w-3 h-3"/></button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                     <button onClick={() => setTeacherViewMode('single')} className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${teacherViewMode==='single' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>個人檢視</button>
                     <button onClick={() => setTeacherViewMode('batch')} className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${teacherViewMode==='batch' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>週次檢視 (批量輸入)</button>
                </div>

                {teacherViewMode === 'single' && (
                    <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="flex gap-3 w-full md:flex-1">
                            <div className="relative flex-1">
                                <input id="loadIdInput" type="text" placeholder="輸入學號..." className="w-full p-3 pl-10 rounded-xl bg-slate-50 border-none text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-100 uppercase tracking-widest placeholder:tracking-normal text-center" />
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                            </div>
                            <button onClick={() => document.getElementById('loadIdInput').value && loadStudentForTeacher(document.getElementById('loadIdInput').value.toUpperCase())} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors">載入</button>
                            <button onClick={() => setShowAddStudentModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-emerald-200 whitespace-nowrap transition-all active:scale-95"><UserPlus className="w-4 h-4"/> 新增</button>
                            <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-blue-200 whitespace-nowrap transition-all active:scale-95">
                                <FileSpreadsheet className="w-4 h-4" /> 匯入 Excel
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                            </label>
                        </div>
                        <div className="w-full md:w-auto">
                            <button onClick={() => setShowAvgModal(true)} className="w-full md:w-auto justify-center text-xs font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 px-4 py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors"><Edit3 className="w-4 h-4"/> 設定班級平均</button>
                        </div>
                    </div>
                )}

                {teacherViewMode === 'batch' && (
                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-500">選擇日期：</span>
                                <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400" value={batchDate} onChange={(e) => setBatchDate(e.target.value)}>
                                    {[...availableDates].sort(customDateSort).reverse().map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <button onClick={handleSaveBatchGrades} className="bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-200 hover:bg-emerald-600 transition-all active:scale-95 flex items-center gap-1"><Save className="w-4 h-4"/> 儲存全班</button>
                        </div>
                        <div className="max-h-[60vh] overflow-x-auto overflow-y-auto rounded-2xl border border-slate-100">
                            <table className="w-full text-sm text-left min-w-[600px]">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-3 font-bold text-center w-10 bg-slate-50">#</th>
                                        <th className="px-4 py-3 font-bold bg-slate-50">學號</th>
                                        <th className="px-4 py-3 font-bold bg-slate-50">姓名</th>
                                        <th className="px-2 py-3 text-center text-blue-500 bg-slate-50">國文</th>
                                        <th className="px-2 py-3 text-center text-violet-500 bg-slate-50">英文</th>
                                        <th className="px-2 py-3 text-center text-amber-500 bg-slate-50">數學</th>
                                        <th className="px-2 py-3 text-center font-bold text-emerald-600 bg-slate-50">總分</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 bg-white">
                                    {allStudentsData.map((student, sIndex) => {
                                        const dateGrades = (student.grades && student.grades[batchDate]) || { chi: '', eng: '', math: '', total: '' };
                                        return (
                                            <tr key={student.id} className="hover:bg-slate-50/80">
                                                <td className="px-2 py-2 text-center"><div className="text-xs font-bold text-slate-400">{sIndex + 1}</div></td>
                                                <td className="px-4 py-2 font-mono text-xs font-bold text-slate-400">{student.id}</td>
                                                <td className="px-4 py-2 font-bold text-slate-700">{student.name}</td>
                                                {['chi', 'eng', 'math'].map((sub, cIndex) => (
                                                    <td key={sub} className="px-1 py-2">
                                                        <input id={`cell-${sIndex}-${sub}`} type="text" className="w-full text-center p-2 rounded-lg bg-slate-50 focus:bg-white border border-transparent focus:border-emerald-200 outline-none text-sm font-bold text-slate-600 transition-all" value={dateGrades[sub]} onChange={(e) => handleBatchGradeChange(student.id, sub, e.target.value)} onKeyDown={(e) => handleKeyDown(e, sIndex, sub)} onPaste={(e) => handlePaste(e, sIndex, sub)} placeholder="-" />
                                                    </td>
                                                ))}
                                                <td className="px-1 py-2 text-center"><div className="py-2 text-sm font-black text-emerald-600">{dateGrades.total}</div></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            {statusMsg && <div className="bg-emerald-50 text-emerald-700 px-6 py-4 rounded-2xl flex items-center text-sm font-bold border border-emerald-100 animate-in fade-in shadow-lg shadow-emerald-50"><Check className="w-5 h-5 mr-3" /> {statusMsg}</div>}
            
            {teacherViewMode === 'single' && currentStudentId && !loading && (
              <div className="bg-gradient-to-br from-white to-slate-50 rounded-3xl shadow-xl shadow-slate-200/50 border border-white overflow-hidden animate-in fade-in duration-500">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm">
                  <div className="flex-1 mr-4">
                      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className="text-2xl font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-emerald-400 outline-none w-full placeholder:text-slate-300 transition-all tracking-wide" placeholder="學生姓名"/>
                      <span className="text-slate-400 text-xs font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 mt-1 inline-block shadow-sm">{currentStudentId}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleDeleteStudent} className="bg-red-50 text-red-500 p-2.5 rounded-xl hover:bg-red-100 transition-colors active:scale-95"><Trash2 className="w-5 h-5"/></button>
                    <button onClick={handleSaveGrades} className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2"><Save className="w-4 h-4"/> 儲存</button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-4 font-bold tracking-wider">日期</th>
                                <th className="px-2 py-4 text-center text-blue-500 font-bold">國文</th>
                                <th className="px-2 py-4 text-center text-violet-500 font-bold">英文</th>
                                <th className="px-2 py-4 text-center text-amber-500 font-bold">數學</th>
                                <th className="px-2 py-4 text-center font-black text-emerald-600">總分</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {[...availableDates].sort(customDateSort).reverse().map((date, dateIndex) => {
                                const g = grades[date] || { chi: '', eng: '', math: '', total: '' };
                                return (
                                    <tr key={date} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-sm font-bold text-slate-400">{date}</td>
                                        {['chi', 'eng', 'math'].map(sub => (
                                            <td key={sub} className="px-2 py-4 text-center">
                                                <input 
                                                  id={`single-${dateIndex}-${sub}`}
                                                  type="text" 
                                                  className="w-full text-center p-2.5 rounded-xl bg-transparent focus:bg-white border border-transparent focus:border-emerald-200 focus:shadow-sm outline-none text-base font-bold transition-all text-slate-600" 
                                                  value={g[sub]} 
                                                  onChange={(e) => handleGradeChange(date, sub, e.target.value)} 
                                                  onKeyDown={(e) => handleSingleKeyDown(e, dateIndex, sub)}
                                                  onPaste={(e) => handleSinglePaste(e, dateIndex, sub)}
                                                  placeholder="-" 
                                                />
                                            </td>
                                        ))}
                                        <td className="px-2 py-4 text-center"><div className="text-base font-black text-emerald-600 py-2">{g.total}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'parent' && (
          <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-700">
            {!viewData && (
            <div className="bg-gradient-to-br from-white/90 to-slate-100/90 backdrop-blur-xl p-10 rounded-[2.5rem] shadow-2xl shadow-emerald-50 border border-white text-center">
              <h2 className="text-3xl font-black text-slate-800 mb-10 tracking-tight">查詢成績</h2>
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-100 focus-within:border-emerald-200 transition-all shadow-inner mb-8">
                <input type="text" placeholder="" className="w-full bg-transparent border-none px-4 py-2 outline-none text-2xl text-slate-800 placeholder:text-slate-300 uppercase font-bold text-center tracking-[0.2em] placeholder:tracking-normal" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
              </div>
              <button onClick={handleParentSearch} disabled={loading} className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-5 rounded-3xl font-bold text-xl hover:shadow-xl hover:shadow-emerald-200/50 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 tracking-wide">{loading ? '查詢中...' : '開始查詢'}</button>
              {searchError && <p className="mt-8 text-red-500 text-sm font-bold bg-red-50 inline-block px-5 py-2 rounded-full animate-bounce">{searchError}</p>}
            </div>
            )}

            {viewData && (
              <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 overflow-hidden border border-white/60 animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="bg-slate-900 text-white p-8 pb-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full -mr-20 -mt-20 blur-3xl opacity-20 animate-pulse"></div>
                   <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500 rounded-full -ml-10 -mb-10 blur-3xl opacity-20"></div>
                   <div className="relative z-10 flex justify-between items-start mb-4">
                       <div>
                           <div className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 border border-emerald-500/30 inline-block px-2 py-0.5 rounded-md">Student Profile</div>
                           <h3 className="text-3xl font-black tracking-tight">{viewData.name}</h3>
                           <p className="text-slate-400 font-mono text-xs mt-1 font-bold">{viewData.id}</p>
                       </div>
                       <button onClick={() => setViewData(null)} className="text-slate-400 hover:text-white bg-white/10 p-2.5 rounded-2xl backdrop-blur-md transition-colors"><LogOut className="w-5 h-5"/></button>
                   </div>
                </div>

                <div className="p-6">
                  {/* ★★★ 修正：置中 Phase Tabs ★★★ */}
                  <div className="flex bg-slate-50 p-1 mb-4 rounded-xl border border-slate-100 overflow-x-auto justify-center">
                      {PHASES.map(phase => (
                          <button key={phase.id} onClick={() => setActivePhase(phase.id)} className={`flex-1 whitespace-nowrap px-4 py-2 text-xs font-bold rounded-lg transition-all ${activePhase === phase.id ? 'bg-white text-slate-800 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>{phase.name}</button>
                      ))}
                  </div>

                  {/* ★★★ 修正：置中 Subject Tabs ★★★ */}
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8 shadow-inner justify-center">
                      {['總分', '國文', '英文', '數學'].map(tab => {
                          const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                          const isActive = activeTab === tabKey;
                          const color = COLORS[tabKey].tailwind;
                          return (
                              <button key={tabKey} onClick={() => setActiveTab(tabKey)} className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all duration-300 ${isActive ? 'bg-white text-slate-800 shadow-md transform scale-100' : 'text-slate-400 hover:text-slate-600'}`}>
                                {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full bg-${color}-500 mr-2 mb-0.5`}></span>}{tab}
                              </button>
                          )
                      })}
                  </div>

                  {(() => {
                      const filteredData = getPhaseData(viewData.chartData);
                      return (
                        <>
                          {activeTab === 'total' && <SingleSubjectChart data={filteredData} subjectKey="total" avgKey="avgTotal" colorKey="total" title="總分" domain={[100, 300]} />}
                          {activeTab === 'chi' && <SingleSubjectChart data={filteredData} subjectKey="chi" avgKey="avgChi" colorKey="chi" title="國文" domain={[0, 100]} />}
                          {activeTab === 'eng' && <SingleSubjectChart data={filteredData} subjectKey="eng" avgKey="avgEng" colorKey="eng" title="英文" domain={[0, 100]} />}
                          {activeTab === 'math' && <SingleSubjectChart data={filteredData} subjectKey="math" avgKey="avgMath" colorKey="math" title="數學" domain={[0, 100]} />}
                        </>
                      );
                  })()}
                </div>
                
                <div className="bg-white p-6 border-t border-slate-50">
                    <h4 className="font-bold text-slate-800 mb-6 text-sm flex items-center justify-center gap-2 tracking-wide"><Clipboard className="w-4 h-4 text-slate-400"/> 詳細紀錄</h4>
                    <div className="space-y-4">
                        {getPhaseData(viewData.chartData).slice().reverse().map((d) => {
                             const totalRank = calculateRank(d.date, 'total', d.total);
                             return (
                             <div key={d.date} className="group bg-white p-5 rounded-3xl border border-slate-100 hover:border-emerald-100 hover:shadow-xl hover:shadow-emerald-50/50 transition-all duration-300">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-xs font-bold text-slate-400 font-mono group-hover:text-emerald-500 transition-colors tracking-wide">{d.date}</span>
                                        <button onClick={() => openStatsModal(d.date, { total: d.total, chi: d.chi, eng: d.eng, math: d.math })} className="text-[10px] bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 px-2 py-1 rounded-lg transition-colors font-bold flex items-center gap-1 mt-1 border border-slate-100 w-fit">
                                            <BarChart3 className="w-3 h-3" /> 查看全班分析
                                        </button>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-3xl font-black tracking-tight text-emerald-500`}>{f1(d.total)}</div>
                                        <div className="flex items-center justify-end gap-2 mt-1">
                                            {totalRank !== '-' && <span className="bg-yellow-100 text-yellow-700 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Trophy className="w-3 h-3"/> #{totalRank}</span>}
                                            {d.avgTotal && <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Avg {f1(d.avgTotal)}</div>}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-50">
                                    {['chi', 'eng', 'math'].map(sub => {
                                        // 更新列表卡片顏色
                                        const subColor = sub === 'chi' ? 'red' : sub === 'eng' ? 'violet' : 'blue';
                                        const subLabel = sub === 'chi' ? '國文' : sub === 'eng' ? '英文' : '數學';
                                        const subScore = d[sub];
                                        const subRank = calculateRank(d.date, sub, subScore);
                                        return (
                                            <div key={sub} className="bg-slate-50/50 rounded-xl p-2 text-center">
                                                <div className={`text-[10px] font-bold text-${subColor}-500 mb-0.5`}>{subLabel}</div>
                                                <div className="font-black text-slate-700">{f1(subScore)}</div>
                                                {subRank !== '-' && <div className="text-[9px] font-bold text-slate-400 mt-0.5">#{subRank}</div>}
                                            </div>
                                        )
                                    })}
                                </div>
                             </div>
                        )})}
                    </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Manual Class Average Modal */}
      {showAvgModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAvgModal(false)}>
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Edit3 className="w-6 h-6 text-indigo-500"/> 設定班級平均</h3>
                    <button onClick={() => setShowAvgModal(false)} className="bg-slate-100 p-2.5 rounded-full hover:bg-slate-200 transition"><X className="w-5 h-5 text-slate-500"/></button>
                </div>
                <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                            <tr>
                                <th className="px-4 py-4 font-bold tracking-wider">日期</th>
                                <th className="px-2 py-4 text-center text-red-500">國文</th>
                                <th className="px-2 py-4 text-center text-violet-500">英文</th>
                                <th className="px-2 py-4 text-center text-blue-500">數學</th>
                                <th className="px-2 py-4 text-center text-emerald-600 font-bold">總分</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {[...availableDates].sort(customDateSort).reverse().map((date, dateIndex) => {
                                const avg = classAverages[date] || { chi: '', eng: '', math: '', total: '' };
                                return (
                                    <tr key={date} className="bg-white">
                                        <td className="px-4 py-3 font-mono font-bold text-slate-500">{date}</td>
                                        {['chi', 'eng', 'math', 'total'].map(sub => (
                                            <td key={sub} className="px-1 py-2">
                                                <input 
                                                    id={`avg-${dateIndex}-${sub}`}
                                                    type="number" 
                                                    className={`w-full text-center p-2.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-bold ${sub==='total'?'text-emerald-600':'text-slate-600'}`} 
                                                    value={avg[sub] || ''} 
                                                    onChange={(e) => handleManualAverageChange(date, sub, e.target.value)} 
                                                    onKeyDown={(e) => handleAvgKeyDown(e, dateIndex, sub)}
                                                    onPaste={(e) => handleAvgPaste(e, dateIndex, sub)}
                                                    placeholder="-" 
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="p-8 border-t border-slate-100 bg-white rounded-b-[2rem] flex justify-end gap-4">
                    <button onClick={() => setShowAvgModal(false)} className="px-8 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-100 transition">取消</button>
                    <button onClick={saveManualClassAverages} className="px-8 py-3 rounded-2xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 shadow-lg shadow-indigo-200 transition active:scale-95">儲存設定</button>
                </div>
            </div>
        </div>
      )}

      {/* Stats Analysis Modal (New Feature) */}
      {statsModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setStatsModalData(null)}>
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <div className="text-xs font-bold text-slate-400 font-mono mb-1">{statsModalData.date}</div>
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-500"/> 週次成績分析</h3>
                    </div>
                    <button onClick={() => setStatsModalData(null)} className="bg-white p-2 rounded-full hover:bg-slate-100 border border-slate-100 transition"><X className="w-5 h-5 text-slate-500"/></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {/* ★★★ 修正：置中 Stats Tabs ★★★ */}
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-6 justify-center">
                        {['總分', '國文', '英文', '數學'].map(tab => {
                            const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                            const isActive = statsActiveTab === tabKey;
                            return (
                                <button key={tabKey} onClick={() => setStatsActiveTab(tabKey)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isActive ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                    {tab}
                                </button>
                            )
                        })}
                    </div>
                    
                    <div className="text-center mb-4">
                        <div className="text-xs font-bold text-slate-400 mb-1">我的成績</div>
                        <div className={`text-3xl font-black ${COLORS[statsActiveTab].tailwind === 'emerald' ? 'text-emerald-500' : COLORS[statsActiveTab].tailwind === 'red' ? 'text-red-500' : COLORS[statsActiveTab].tailwind === 'violet' ? 'text-violet-500' : 'text-blue-500'}`}>
                            {statsModalData.myGrades[statsActiveTab] || '-'}
                        </div>
                    </div>

                    <h4 className="text-xs font-bold text-slate-500 mb-2 pl-2 border-l-4 border-slate-200">成績分佈 (人數)</h4>
                    <DistributionChart data={statsModalData[statsActiveTab]} colorKey={statsActiveTab} />
                    
                    <div className="mt-6 bg-slate-50 rounded-xl p-4 text-xs text-slate-500 leading-relaxed border border-slate-100 text-center">
                        <p className="font-bold mb-1">💡 分析說明</p>
                        深色長條圖表示您目前成績所在的區間。此數據基於班級全體同學的成績統計。
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-emerald-100 p-4 rounded-2xl text-emerald-600"><UserPlus className="w-8 h-8" /></div>
                    <h3 className="font-black text-2xl text-slate-800">建立新學生</h3>
                </div>
                <input type="text" placeholder="例如: 151200" className="w-full p-5 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-emerald-200 text-center font-bold text-2xl text-slate-800 outline-none mb-10 uppercase tracking-widest transition-all" value={newStudentIdInput} onChange={(e) => setNewStudentIdInput(e.target.value)} autoFocus />
                <div className="flex gap-4">
                    <button onClick={() => setShowAddStudentModal(false)} className="flex-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-sm transition-colors">取消</button>
                    <button onClick={handleAddNewStudent} className="flex-1 px-4 py-4 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600 font-bold text-sm shadow-xl shadow-emerald-200 transition-all active:scale-95">確認新增</button>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modals */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-red-100 p-4 rounded-2xl text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                    <div><h3 className="font-black text-2xl text-slate-800">確認刪除</h3><p className="text-slate-400 text-xs mt-1 font-bold">此動作無法復原</p></div>
                </div>
                <p className="text-slate-600 mb-10 text-base font-medium leading-relaxed">確定要刪除 <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg mx-1 text-lg">{deleteTarget}</span> 的資料嗎？</p>
                <div className="flex gap-4 justify-end">
                    <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-sm transition-colors">取消</button>
                    <button onClick={confirmDeleteDate} className="flex-1 px-4 py-4 rounded-2xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-xl shadow-red-200 transition-all active:scale-95">確認刪除</button>
                </div>
            </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setStudentToDelete(null)}>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-red-100 p-4 rounded-2xl text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                    <div><h3 className="font-black text-2xl text-slate-800">確認刪除學生</h3><p className="text-slate-400 text-xs mt-1 font-bold">此動作無法復原</p></div>
                </div>
                <p className="text-slate-600 mb-10 text-base font-medium leading-relaxed">確定要刪除 <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg mx-1 text-lg">{studentToDelete.name}</span> 嗎？</p>
                <div className="flex gap-4 justify-end">
                    <button onClick={() => setStudentToDelete(null)} className="flex-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-sm transition-colors">取消</button>
                    <button onClick={confirmDeleteStudent} className="flex-1 px-4 py-4 rounded-2xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-xl shadow-red-200 transition-all active:scale-95">確認刪除</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}