import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Search, Save, Plus, Check, BarChart3, X, Lock, LayoutDashboard, GraduationCap, Calendar, Clipboard, LogOut, AlertTriangle, UserPlus, Sparkles, Edit3, Trash2, Trophy, Target, FileSpreadsheet, Moon, Sun, ChevronRight, ArrowLeft } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

// --- Global Constants ---
const EXAM_DATES = [
  "04/12", "04/19", "04/26", "05/03", "05/10", "05/17", "05/24", "06/07", "06/14",
  "06/21", "06/28", "06/29", "07/12", "07/19", "07/21", "07/26", "08/02", "08/09", 
  "08/16", "08/30", "09/06", "09/13", "09/20", "09/27", "09/29", "10/04", 
  "10/11", "10/18", "10/25", "11/01", "11/08", "11/15", "11/29", "12/06", "12/13", "12/20",
  "12/27", "01/03", "01/10", "01/17", "01/24", "01/31", "02/02", "02/07", "02/13", "02/28"
];

const RAW_STUDENT_RECORDS = [];

// --- Firebase Configuration ---
const realFirebaseConfig = {
  apiKey: "AIzaSyChK1IiE6YhHZ_DdxXzpxi8vmBA9A9So9A",
  authDomain: "grade-tracker-9ccb3.firebaseapp.com",
  projectId: "grade-tracker-9ccb3",
  storageBucket: "grade-tracker-9ccb3.firebasestorage.app",
  messagingSenderId: "55920171494",
  appId: "1:55920171494:web:0529f931aaefd930f11e27"
};

let app, auth, db, appId = 'grade-tracker-v1';

try {
  if (typeof __firebase_config !== 'undefined') {
    const config = JSON.parse(__firebase_config);
    if (!getApps().length) app = initializeApp(config);
    else app = getApp();
    if (typeof __app_id !== 'undefined') appId = __app_id;
  } 
  else if (realFirebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
    if (!getApps().length) app = initializeApp(realFirebaseConfig);
    else app = getApp();
  }
  if (app) { auth = getAuth(app); db = getFirestore(app); }
} catch (e) { console.error("Firebase init error:", e); }

// --- Helpers ---
const customDateSort = (a, b) => {
    const [m1, d1] = a.split('/').map(Number);
    const [m2, d2] = b.split('/').map(Number);
    const m1Adj = m1 < 4 ? m1 + 12 : m1;
    const m2Adj = m2 < 4 ? m2 + 12 : m2;
    if (m1Adj !== m2Adj) return m1Adj - m2Adj;
    return d1 - d2;
};

const PHASES = [
    { id: 'p1', name: '第一階段', range: [0, 18] },
    { id: 'p2', name: '第二階段', range: [18, 36] },
    { id: 'mock', name: '模考班', range: [36, 100] } 
];

const COLORS = {
    total: { hex: '#10b981', tailwind: 'emerald', label: '總分' },
    chi:   { hex: '#f43f5e', tailwind: 'rose',     label: '國文' }, 
    eng:   { hex: '#8b5cf6', tailwind: 'violet',   label: '英文' }, 
    math:  { hex: '#3b82f6', tailwind: 'blue',     label: '數學' }, 
    avg:   { hex: '#94a3b8', tailwind: 'slate',    label: '班平均' } 
};

const f1 = (v) => {
    if (v === '' || v === undefined || v === null) return '';
    const num = parseFloat(v);
    return isNaN(num) ? '' : num.toFixed(1);
};

// Check if a specific date falls into the Mock Phase (Phase 3)
const isMockDate = (date, allDates) => {
    const sorted = [...allDates].sort(customDateSort);
    const idx = sorted.indexOf(date);
    return idx >= 36; // Based on PHASES definition
};

// Get max score for a subject on a given date
const getMaxScore = (date, subject, allDates) => {
    if (subject === 'total') return 300;
    if (subject === 'chi') return 100;
    const isMock = isMockDate(date, allDates);
    if (isMock) {
        if (subject === 'math') return 120;
        if (subject === 'eng') return 80;
    }
    return 100;
};

// --- Components ---
const SingleSubjectChart = ({ data, subjectKey, avgKey, colorKey, title, domain, isDarkMode }) => (
    <div className="mb-6 animate-in fade-in duration-700">
        <div className="h-56 md:h-64 w-full -ml-2">
          <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={isDarkMode ? "#334155" : "#f1f5f9"} vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 500, fontFamily: 'system-ui'}} tickLine={false} axisLine={false} dy={10} interval="preserveStartEnd" />
                  <YAxis domain={domain} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 500, fontFamily: 'system-ui'}} tickLine={false} axisLine={false} width={28} />
                  <Tooltip 
                      contentStyle={{ 
                          borderRadius: '16px', border: 'none', 
                          boxShadow: isDarkMode ? '0 10px 40px -10px rgba(0,0,0,0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)', 
                          padding: '12px 16px', fontSize: '13px', fontWeight: '500',
                          backgroundColor: isDarkMode ? '#1e293b' : 'rgba(255, 255, 255, 0.95)',
                          color: isDarkMode ? '#f8fafc' : '#1e293b'
                      }} 
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}/>
                  {/* Fixed Average Line: Solid line with opacity, no strokeDasharray, custom activeDot to prevent "hole" look */}
                  <Line name="班平均" type="monotone" dataKey={avgKey} stroke="#94a3b8" strokeWidth={2} strokeOpacity={0.6} dot={false} activeDot={{ r: 4, fill: '#94a3b8', stroke: 'none' }} isAnimationActive={false} />
                  <Line name={title} type="monotone" dataKey={subjectKey} stroke={COLORS[colorKey].hex} strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={true} animationDuration={1500}/>
              </LineChart>
          </ResponsiveContainer>
        </div>
    </div>
);

const DistributionChart = ({ data, colorKey, isDarkMode }) => (
    <div className="h-56 w-full mt-6">
        <ResponsiveContainer width="100%" height="100%">
            {/* Increased bottom margin to prevent labels being cut off */}
            <BarChart data={data} margin={{ top: 10, right: 0, bottom: 40, left: -20 }}>
                <CartesianGrid stroke={isDarkMode ? "#334155" : "#f1f5f9"} vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{fontSize: 9, fill: '#94a3b8', fontWeight: 500}} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" dy={10} />
                <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{fill: isDarkMode ? '#334155' : '#f1f5f9', opacity: 0.4}} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: isDarkMode ? '#1e293b' : '#fff', color: isDarkMode ? '#fff' : '#000', fontSize: '12px' }} />
                <Bar dataKey="count" name="人數" radius={[4, 4, 0, 0]}>
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isMyRange ? COLORS[colorKey].hex : (isDarkMode ? '#475569' : '#e2e8f0')} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>
);

const ExamCountdown = ({ isDarkMode }) => {
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
        <div className={`flex items-center gap-3 mt-6 px-5 py-2.5 rounded-full border backdrop-blur-md transition-all duration-500 ${isDarkMode ? 'bg-slate-800/40 border-slate-700/50 text-slate-200' : 'bg-white/60 border-white/60 text-slate-600 shadow-sm'}`}>
            <Target className="w-4 h-4 text-emerald-500" />
            <div className="flex items-baseline gap-1.5 font-mono text-sm">
                <span className="font-bold">{timeLeft.days}</span><span className="text-[10px] opacity-50 mr-1">DAYS</span>
                <span className="font-bold">{String(timeLeft.hours).padStart(2,'0')}</span><span className="opacity-30">:</span>
                <span className="font-bold">{String(timeLeft.minutes).padStart(2,'0')}</span><span className="opacity-30">:</span>
                <span className="font-bold text-emerald-500">{String(timeLeft.seconds).padStart(2,'0')}</span>
            </div>
        </div>
    );
};

export default function App() {
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
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      if (hour >= 18 || hour < 6) setDarkMode(true);
    };
    checkTime();
  }, []);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => setXlsxLoaded(true);
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) return;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      } catch (e) { console.error(e); }
    };
    if (auth) {
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, (u) => {
          setUser(u);
          if (u) { loadDates(); loadClassAverages(); }
        });
        return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
      if (availableDates.length > 0 && !batchDate) setBatchDate(availableDates[availableDates.length - 1]);
  }, [availableDates]);

  // --- Logic Helpers ---
  const loadDates = async () => {
      if (!db) return;
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'));
          if (docSnap.exists() && docSnap.data().list) setAvailableDates(docSnap.data().list.sort(customDateSort));
          else {
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
      setStatusMsg(`已新增: ${newDateInput}`); setTimeout(() => setStatusMsg(''), 2000);
  };

  const localComputedAverages = useMemo(() => {
      const avgs = {};
      availableDates.forEach(date => {
          let t=0, c=0, e=0, m=0, count=0;
          allStudentsData.forEach(s => {
              const grades = s.grades && s.grades[date];
              if (grades) {
                  const math = parseFloat(grades.math) || 0;
                  const eng = parseFloat(grades.eng) || 0;
                  const chi = parseFloat(grades.chi) || 0;
                  const total = parseFloat(grades.total) || 0;
                  if (grades.total !== '' && total > 0) { t += total; m += math; e += eng; c += chi; count++; }
              }
          });
          if(count > 0) avgs[date] = { total: (t/count).toFixed(1), chi: (c/count).toFixed(1), eng: (e/count).toFixed(1), math: (m/count).toFixed(1) };
      });
      return avgs;
  }, [availableDates, allStudentsData]);

  const loadClassAverages = async () => {
      if (!db) { setClassAverages(localComputedAverages); return; }
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v17'));
          let dbAverages = {};
          if (docSnap.exists()) dbAverages = docSnap.data().averages || {};
          setClassAverages({ ...localComputedAverages, ...dbAverages });
      } catch (e) { setClassAverages(localComputedAverages); }
  };

  useEffect(() => { setClassAverages(prev => ({ ...prev, ...localComputedAverages })); }, [localComputedAverages]);

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
          setStatusMsg("設定已儲存"); setTimeout(() => setStatusMsg(''), 2000); setShowAvgModal(false);
      } catch (e) { setStatusMsg("儲存失敗"); }
  };

  const handleDeleteDate = (dateToDelete) => setDeleteTarget(dateToDelete);
  const confirmDeleteDate = async () => {
      if (!deleteTarget) return;
      const newList = availableDates.filter(d => d !== deleteTarget);
      setAvailableDates(newList);
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已刪除: ${deleteTarget}`); setTimeout(() => setStatusMsg(''), 2000); setDeleteTarget(null);
  };

  const handleLoginSubmit = () => {
      if (passwordInput === 'Ben110705') { 
          setIsAuthenticated(true); localStorage.setItem('teacher_auth', 'true'); setMode('teacher'); loadAllStudents();
      } else { setLoginError(true); }
  };

  const handleLogout = () => { setIsAuthenticated(false); localStorage.removeItem('teacher_auth'); setMode('landing'); };

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
      } catch (e) { console.error("Load error:", e); }
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
    if (!xlsxLoaded) { setStatusMsg("載入中，請稍後"); return; }
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = window.XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        // Find Header Row dynamically
        let headerRowIndex = -1;
        const colMap = { id: -1, name: -1, date: -1, chi: -1, eng: -1, math: -1 };

        // Search first 10 rows for headers
        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const row = data[i];
            const rowStr = row.map(c => String(c).trim());
            if (rowStr.some(c => c.includes('學號') || c.includes('ID'))) {
                headerRowIndex = i;
                rowStr.forEach((cell, idx) => {
                    if (cell.includes('學號') || cell.includes('ID')) colMap.id = idx;
                    else if (cell.includes('姓名') || cell.includes('Name')) colMap.name = idx;
                    else if (cell.includes('日期') || cell.includes('Date')) colMap.date = idx;
                    else if (cell.includes('國') || cell.includes('Chi')) colMap.chi = idx;
                    else if (cell.includes('英') || cell.includes('Eng')) colMap.eng = idx;
                    else if (cell.includes('數') || cell.includes('Math')) colMap.math = idx;
                });
                break;
            }
        }

        if (headerRowIndex === -1 || colMap.id === -1) {
             headerRowIndex = 0; 
             colMap.id = 0; colMap.name = 1; colMap.date = 2; colMap.chi = 3; colMap.eng = 4; colMap.math = 5;
        }

        const newStudentsMap = allStudentsData.reduce((acc, s) => { acc[s.id] = { ...s, grades: { ...s.grades } }; return acc; }, {});
        const newDates = new Set(availableDates);
        let importCount = 0;
        let lastImportedDate = '';

        for (let i = headerRowIndex + 1; i < data.length; i++) {
          const row = data[i];
          if (!row[colMap.id]) continue; 
          
          const rawId = String(row[colMap.id]).toUpperCase().trim();
          const rawName = colMap.name !== -1 && row[colMap.name] ? String(row[colMap.name]).trim() : '';
          
          // Date parsing
          let dateStr = '';
          if (colMap.date !== -1 && row[colMap.date]) {
               const rawDate = row[colMap.date];
               let dString = String(rawDate).padStart(4, '0'); 
               if (dString.length === 4 && !dString.includes('/')) dateStr = `${dString.slice(0, 2)}/${dString.slice(2)}`;
               else dateStr = String(rawDate); 
          }

          if (!dateStr) continue;

          // Scores
          const chi = colMap.chi !== -1 ? row[colMap.chi] : '';
          const eng = colMap.eng !== -1 ? row[colMap.eng] : '';
          const math = colMap.math !== -1 ? row[colMap.math] : '';

          if (!newDates.has(dateStr)) newDates.add(dateStr);
          lastImportedDate = dateStr;

          let student = newStudentsMap[rawId];
          if (!student) { 
              student = { id: rawId, name: rawName || '未命名', grades: {} }; 
              newStudentsMap[rawId] = student; 
          } else if (rawName) {
              student.name = rawName;
          }
          
          student.grades[dateStr] = {
              chi: String(chi || ''), 
              eng: String(eng || ''), 
              math: String(math || ''), 
              total: calculateTotal(chi, eng, math)
          };
          importCount++;
        }

        const sortedDates = Array.from(newDates).sort(customDateSort);
        setAvailableDates(sortedDates);
        if (lastImportedDate) setBatchDate(lastImportedDate);
        else if (sortedDates.length > 0 && !batchDate) setBatchDate(sortedDates[sortedDates.length - 1]);
        
        if (db) setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: sortedDates }, { merge: true });

        const sortedStudents = Object.values(newStudentsMap).sort((a,b) => a.id.localeCompare(b.id));
        setAllStudentsData([...sortedStudents]); 
        
        setStatusMsg(`匯入 ${importCount} 筆資料`);
      } catch (error) { console.error(error); setStatusMsg("匯入失敗"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleGridKeyDown = (e, index, subject, type, totalItems) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let nextIndex = index;
        let nextSubject = subject;
        const subjects = type === 'avg' ? ['chi', 'eng', 'math', 'total'] : ['chi', 'eng', 'math'];
        const subjectIndex = subjects.indexOf(subject);
        
        if (e.key === 'ArrowUp') nextIndex = Math.max(0, index - 1);
        else if (e.key === 'ArrowDown') nextIndex = Math.min(totalItems - 1, index + 1);
        else if (e.key === 'ArrowLeft' && subjectIndex > 0) nextSubject = subjects[subjectIndex - 1];
        else if (e.key === 'ArrowRight' && subjectIndex < subjects.length - 1) nextSubject = subjects[subjectIndex + 1];
        
        let nextInputId = '';
        if (type === 'batch') nextInputId = `cell-${nextIndex}-${nextSubject}`;
        else if (type === 'single') nextInputId = `single-${nextIndex}-${nextSubject}`;
        else if (type === 'avg') nextInputId = `avg-${nextIndex}-${nextSubject}`;

        const nextInput = document.getElementById(nextInputId);
        if (nextInput) { nextInput.focus(); nextInput.select(); }
    }
  };

  const handleKeyDown = (e, studentIndex, subject) => handleGridKeyDown(e, studentIndex, subject, 'batch', allStudentsData.length);
  const handleSingleKeyDown = (e, dateIndex, subject) => handleGridKeyDown(e, dateIndex, subject, 'single', availableDates.length);
  const handleAvgKeyDown = (e, dateIndex, subject) => handleGridKeyDown(e, dateIndex, subject, 'avg', availableDates.length);

  const handlePaste = (e, startStudentIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/);
      const subjects = ['chi', 'eng', 'math'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      
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
                  currentDateGrades[subject] = val.trim();
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
        setStatusMsg(`已刪除`); setTimeout(() => setStatusMsg(''), 2000); setStudentToDelete(null);
    } catch (e) { setStatusMsg("刪除失敗"); }
  };

  const handleSaveGrades = async () => {
    if (!user || !currentStudentId) return;
    if (!studentName.trim()) { setStatusMsg('請輸入姓名'); return; }
    setStatusMsg('儲存中...');
    try {
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${currentStudentId}`), { id: currentStudentId, name: studentName, grades: grades, lastUpdated: new Date().toISOString() }, { merge: true });
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
              const batchPromises = allStudentsData.map(student => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${student.id}`), { id: student.id, name: student.name, grades: student.grades, lastUpdated: new Date().toISOString() }, { merge: true }));
              await Promise.all(batchPromises);
              setStatusMsg("全班儲存成功"); setTimeout(() => setStatusMsg(''), 2000);
          }
      } catch (e) { setStatusMsg("儲存失敗"); }
  };

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
              if (cachedClassData.length > 0) fullClassData = cachedClassData;
              else {
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
                     date, total: t, chi: parseFloat(weekData.chi)||0, eng: parseFloat(weekData.eng)||0, math: parseFloat(weekData.math)||0,
                     avgTotal: parseFloat(avgData.total)||null, avgChi: parseFloat(avgData.chi)||null, avgEng: parseFloat(avgData.eng)||null, avgMath: parseFloat(avgData.math)||null
                 });
             }
          }
        }
        const avg = allChartData.length > 0 ? (allChartData.reduce((a,b)=>a+b.total,0)/allChartData.length).toFixed(1) : 0;
        setViewData({ ...data, chartData: allChartData, average: avg });
      } else { setSearchError('查無此學號'); }
    } catch (e) { setSearchError('系統忙碌'); }
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

  const calculateDistribution = (date, subject, myScore, allDates) => {
      if (!cachedClassData.length) return [];
      const myVal = parseFloat(myScore);
      let buckets = [];
      const maxScore = getMaxScore(date, subject, allDates);
      
      // Determine floor based on max score (to avoid too many buckets)
      // For 120/100 -> 60 floor. For 80 -> 40 floor. Total 300 -> 150 floor.
      const floor = maxScore === 300 ? 150 : (maxScore === 80 ? 40 : 60);
      
      // Generate 10-point interval buckets
      let currentMax = maxScore;
      // We want bands like 110-120, 100-109, etc.
      // Special case: Top bucket usually includes the Max.
      
      // We'll generate buckets down to the floor
      while (currentMax > floor) {
          const min = currentMax - 9; // e.g., 100 -> 91?
          // Let's use strict 10s: 110-119, 100-109. 
          // But top score (120) needs to be captured.
          // Let's use thresholds approach for cleaner logic
          // 120 -> [110, 100, 90, 80, 70, 60]
          
          break; // Moving to thresholds approach below
      }

      let thresholds = [];
      if (maxScore === 300) {
          thresholds = [290, 280, 270, 260, 250, 240, 230, 220, 210, 200, 190, 180, 170, 160, 150];
      } else if (maxScore === 120) {
          thresholds = [110, 100, 90, 80, 70, 60];
      } else if (maxScore === 80) {
          thresholds = [70, 60, 50, 40];
      } else { // 100
          thresholds = [90, 80, 70, 60];
      }

      buckets = thresholds.map((min, i) => {
          let label = `${min}-${min+9}`;
          let max = min + 9;
          
          // Handle top bucket visual adjustment (e.g. 110-120)
          if (i === 0 && min + 10 === maxScore) {
              label = `${min}-${maxScore}`;
              max = maxScore;
          } else if (i === 0 && min + 10 > maxScore) {
               // Rare case, just keep 9
          }
          
          return { min, max, count: 0, label, isMyRange: false };
      });
      
      // Add "Below X" bucket
      buckets.push({ min: 0, max: thresholds[thresholds.length-1]-1, count: 0, label: `<${thresholds[thresholds.length-1]}`, isMyRange: false });

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
      setStatsModalData({
          date,
          total: calculateDistribution(date, 'total', grades.total, availableDates),
          chi: calculateDistribution(date, 'chi', grades.chi, availableDates),
          eng: calculateDistribution(date, 'eng', grades.eng, availableDates),
          math: calculateDistribution(date, 'math', grades.math, availableDates),
          myGrades: grades
      });
  };

  if (!user && !db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Initializing...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Connecting...</div>;

  return (
    <div className={`min-h-screen font-sans antialiased transition-colors duration-500 ease-in-out pb-32 ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-600'}`}>
      {/* Header */}
      <header className={`fixed top-0 w-full backdrop-blur-xl z-30 border-b transition-all duration-300 ${darkMode ? 'bg-slate-950/70 border-white/5' : 'bg-white/70 border-white/40'}`}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setMode('landing')}>
            <div className={`p-2 rounded-xl shadow-lg transition-transform group-hover:scale-105 duration-300 ${darkMode ? 'bg-emerald-500/10 text-emerald-400 shadow-emerald-500/10' : 'bg-white text-emerald-600 shadow-emerald-200/50'}`}><GraduationCap className="h-5 w-5" /></div>
            <div>
                <h1 className={`text-base font-bold tracking-tight leading-none ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>六私A班</h1>
                <p className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5 opacity-80">Grade Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode} className={`p-2 rounded-full transition-colors active:scale-95 duration-200 ${darkMode ? 'text-yellow-400 hover:bg-white/5' : 'text-slate-400 hover:bg-slate-100'}`}>
                {darkMode ? <Moon className="w-4 h-4 fill-current"/> : <Sun className="w-4 h-4"/>}
            </button>
            <div className={`flex p-1 rounded-full border backdrop-blur-md ${darkMode ? 'bg-white/5 border-white/5' : 'bg-white/50 border-white/40'}`}>
                <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode.includes('teacher') ? (darkMode ? 'bg-slate-700 text-emerald-400' : 'bg-white text-emerald-600 shadow-sm') : 'text-slate-400 hover:text-slate-500'}`}>{isAuthenticated ? '後台' : '老師'}</button>
                <button onClick={() => setMode('parent')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode === 'parent' ? (darkMode ? 'bg-slate-700 text-emerald-400' : 'bg-white text-emerald-600 shadow-sm') : 'text-slate-400 hover:text-slate-500'}`}>家長</button>
            </div>
            {isAuthenticated && (
                <button onClick={handleLogout} className="ml-1 p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"><LogOut className="w-4 h-4"/></button>
            )}
          </div>
        </div>
      </header>

      <main className="pt-28 px-4 max-w-4xl mx-auto">
        {mode === 'landing' && (
          <div className="flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in duration-700">
            <div className={`p-8 rounded-full mb-8 shadow-2xl ring-1 backdrop-blur-3xl ${darkMode ? 'bg-slate-900/50 shadow-emerald-900/10 ring-white/10' : 'bg-white shadow-emerald-100/60 ring-white'}`}>
                <Sparkles className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className={`text-3xl font-bold tracking-tighter mb-2 text-center ${darkMode ? 'text-white' : 'text-slate-800'}`}>Make Progress Visible</h2>
            <p className="text-slate-400 text-sm font-medium tracking-wide mb-8">2025-2026 Learning Journey</p>
            <ExamCountdown isDarkMode={darkMode} />
            
            <div className="w-full max-w-sm space-y-4 mt-12">
               <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className={`group w-full p-5 rounded-[1.5rem] border flex items-center gap-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-300 ${darkMode ? 'bg-slate-900/40 border-white/10 hover:border-emerald-500/30' : 'bg-white/80 border-white hover:border-emerald-200 shadow-sm'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><LayoutDashboard className="w-6 h-6" /></div>
                  <div className="text-left flex-1"><h3 className={`text-lg font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>老師通道</h3><p className="text-xs text-slate-400 mt-0.5">管理成績與設定</p></div>
                  <ChevronRight className="w-5 h-5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
               </button>
               <button onClick={() => setMode('parent')} className={`group w-full p-5 rounded-[1.5rem] border flex items-center gap-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-300 ${darkMode ? 'bg-slate-900/40 border-white/10 hover:border-blue-500/30' : 'bg-white/80 border-white hover:border-blue-200 shadow-sm'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><BarChart3 className="w-6 h-6" /></div>
                  <div className="text-left flex-1"><h3 className={`text-lg font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>家長查詢</h3><p className="text-xs text-slate-400 mt-0.5">輸入學號查看分析</p></div>
                  <ChevronRight className="w-5 h-5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
               </button>
            </div>
          </div>
        )}

        {mode === 'teacher_login' && (
            <div className="flex items-center justify-center min-h-[50vh] animate-in fade-in slide-in-from-bottom-4">
                <div className={`backdrop-blur-xl p-8 rounded-[2rem] w-full max-w-sm text-center border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white/80 border-white shadow-xl shadow-slate-200/50'}`}>
                    <div className={`inline-flex p-3 rounded-2xl mb-6 ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><Lock className="w-6 h-6" /></div>
                    <h2 className={`text-xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-800'}`}>身份驗證</h2>
                    <input type="password" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setLoginError(false); }} onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} className={`w-full p-3.5 rounded-xl text-center text-lg font-bold tracking-[0.3em] outline-none transition-all mb-4 placeholder:tracking-normal border-2 ${darkMode ? 'bg-slate-950 border-transparent text-white focus:border-emerald-500/50' : 'bg-slate-50 border-transparent text-slate-800 focus:bg-white focus:border-emerald-200'}`} placeholder="輸入密碼" autoFocus />
                    {loginError && <p className="text-red-500 text-xs font-bold mb-4">密碼錯誤</p>}
                    <button onClick={handleLoginSubmit} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all">登入</button>
                </div>
            </div>
        )}

        {mode === 'teacher' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className={`p-6 rounded-[2rem] border ${darkMode ? 'bg-slate-900/40 border-white/5' : 'bg-white/60 border-white/60 shadow-sm'}`}>
                <div className="flex justify-between items-center mb-4">
                    <div className={`flex items-center gap-2 font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}><Calendar className="w-4 h-4 text-emerald-500"/>管理日期</div>
                    <div className="flex gap-2">
                         <input type="text" placeholder="MM/DD" className={`w-20 p-2 rounded-lg text-xs text-center font-bold outline-none transition-colors tracking-widest border ${darkMode ? 'bg-slate-950 border-white/10 text-slate-200 focus:border-emerald-500' : 'bg-white border-slate-200 text-slate-800 focus:border-emerald-400'}`} value={newDateInput} onChange={e=>setNewDateInput(e.target.value)} />
                         <button onClick={addDate} className={`px-3 rounded-lg transition-colors ${darkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-800 text-white hover:bg-black'}`}><Plus className="w-4 h-4"/></button>
                    </div>
                </div>
                <div className={`flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 rounded-xl border mb-6 no-scrollbar ${darkMode ? 'bg-slate-950/50 border-white/5' : 'bg-slate-50/50 border-slate-100'}`}>
                    {[...availableDates].sort(customDateSort).reverse().map(d => (
                        <div key={d} className={`flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border ${darkMode ? 'bg-slate-800 text-slate-300 border-white/5' : 'bg-white text-slate-500 border-slate-200'}`}>
                            {d} <button onClick={() => handleDeleteDate(d)} className="ml-1.5 text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                        </div>
                    ))}
                </div>

                <div className={`flex p-1 rounded-xl mb-6 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
                     <button onClick={() => setTeacherViewMode('single')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='single' ? (darkMode ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-800 shadow-sm') : 'text-slate-500'}`}>個人檢視</button>
                     <button onClick={() => setTeacherViewMode('batch')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='batch' ? (darkMode ? 'bg-slate-800 text-emerald-400' : 'bg-white text-emerald-600 shadow-sm') : 'text-slate-500'}`}>批量檢視</button>
                </div>

                {teacherViewMode === 'single' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input id="loadIdInput" type="text" placeholder="輸入學號..." className={`w-full p-3 pl-9 rounded-xl border-none text-sm font-bold outline-none uppercase tracking-widest placeholder:tracking-normal text-center ${darkMode ? 'bg-slate-950 text-slate-200 focus:ring-1 focus:ring-emerald-500' : 'bg-slate-50 text-slate-800 focus:ring-2 focus:ring-emerald-100'}`} />
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                            </div>
                            <button onClick={() => document.getElementById('loadIdInput').value && loadStudentForTeacher(document.getElementById('loadIdInput').value.toUpperCase())} className={`px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>載入</button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setShowAddStudentModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all whitespace-nowrap"><UserPlus className="w-4 h-4"/> 新增學生</button>
                            <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-900/20 active:scale-[0.98] transition-all whitespace-nowrap">
                                <FileSpreadsheet className="w-4 h-4" /> 匯入 Excel
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                            </label>
                            <button onClick={() => setShowAvgModal(true)} className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${darkMode ? 'text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}><Edit3 className="w-4 h-4"/> 平均設定</button>
                        </div>
                    </div>
                )}

                {teacherViewMode === 'batch' && (
                    <div className="pt-2">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">日期</span>
                                <select className={`border rounded-lg px-2 py-1.5 text-xs font-bold outline-none ${darkMode ? 'bg-slate-950 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`} value={batchDate} onChange={(e) => setBatchDate(e.target.value)}>
                                    {[...availableDates].sort(customDateSort).reverse().map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <button onClick={handleSaveBatchGrades} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-emerald-900/20 hover:bg-emerald-500 transition-all active:scale-[0.98] flex items-center gap-1"><Save className="w-3.5 h-3.5"/> 儲存</button>
                        </div>
                        {/* Fix: Overflow handling for mobile */}
                        <div className={`overflow-x-auto rounded-xl border ${darkMode ? 'border-white/5 bg-slate-950' : 'border-slate-100 bg-white'}`}>
                            <table className="w-full text-sm text-left min-w-[500px]">
                                <thead className={`text-[10px] uppercase sticky top-0 z-10 ${darkMode ? 'text-slate-400 bg-slate-900' : 'text-slate-400 bg-slate-50'}`}>
                                    <tr>
                                        <th className="px-3 py-3 font-bold w-12">#</th>
                                        <th className="px-3 py-3 font-bold">學號</th>
                                        <th className="px-3 py-3 font-bold">姓名</th>
                                        <th className="px-2 py-3 text-center text-rose-500">國文</th>
                                        <th className="px-2 py-3 text-center text-violet-500">英文</th>
                                        <th className="px-2 py-3 text-center text-blue-500">數學</th>
                                        <th className="px-2 py-3 text-center font-bold text-emerald-500">總分</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-50'}`}>
                                    {allStudentsData.map((student, sIndex) => {
                                        const dateGrades = (student.grades && student.grades[batchDate]) || { chi: '', eng: '', math: '', total: '' };
                                        return (
                                            <tr key={student.id} className={`${darkMode ? 'hover:bg-slate-900' : 'hover:bg-slate-50'}`}>
                                                <td className="px-3 py-2 text-xs font-bold text-slate-500">{sIndex + 1}</td>
                                                <td className="px-3 py-2 font-mono text-xs font-bold text-slate-500">{student.id}</td>
                                                <td className={`px-3 py-2 font-bold text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{student.name}</td>
                                                {['chi', 'eng', 'math'].map((sub, cIndex) => (
                                                    <td key={sub} className="px-1 py-1">
                                                        <input id={`cell-${sIndex}-${sub}`} type="text" className={`w-full text-center p-1.5 rounded-lg border border-transparent outline-none text-sm font-bold transition-all ${darkMode ? 'bg-slate-900 text-slate-300 focus:bg-slate-800 focus:border-emerald-500/50' : 'bg-slate-50 text-slate-600 focus:bg-white focus:border-emerald-200'}`} value={dateGrades[sub]} onChange={(e) => handleBatchGradeChange(student.id, sub, e.target.value)} onKeyDown={(e) => handleKeyDown(e, sIndex, sub)} onPaste={(e) => handlePaste(e, sIndex, sub)} placeholder="-" />
                                                    </td>
                                                ))}
                                                <td className="px-1 py-1 text-center"><div className="text-sm font-bold text-emerald-500">{dateGrades.total}</div></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            {statusMsg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-5 py-3 rounded-full flex items-center text-xs font-bold shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in z-50"><Check className="w-4 h-4 mr-2 text-emerald-400" /> {statusMsg}</div>}
            
            {teacherViewMode === 'single' && currentStudentId && !loading && (
              <div className={`rounded-[2rem] shadow-xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 ${darkMode ? 'bg-slate-900/60 border-white/5 shadow-emerald-900/5' : 'bg-white border-white shadow-slate-200/50'}`}>
                <div className={`p-6 border-b flex justify-between items-center backdrop-blur-sm ${darkMode ? 'border-white/5 bg-slate-900/50' : 'border-slate-50 bg-white/50'}`}>
                  <div className="flex-1 mr-4">
                      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className={`text-2xl font-bold bg-transparent border-none outline-none w-full transition-all tracking-tight ${darkMode ? 'text-white placeholder:text-slate-700' : 'text-slate-800 placeholder:text-slate-200'}`} placeholder="學生姓名"/>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 inline-block opacity-60 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-400'}`}>{currentStudentId}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleDeleteStudent} className="bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500/20 transition-colors active:scale-95"><Trash2 className="w-5 h-5"/></button>
                    <button onClick={handleSaveGrades} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 transition-all active:scale-95 flex items-center gap-2"><Save className="w-4 h-4"/> 儲存</button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className={`w-full text-sm text-left ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <thead className={`text-[10px] uppercase sticky top-0 z-10 backdrop-blur-md ${darkMode ? 'text-slate-500 bg-slate-900/90' : 'text-slate-400 bg-white/90'}`}>
                            <tr>
                                <th className="px-4 py-3 font-bold">日期</th>
                                <th className="px-2 py-3 text-center text-rose-500 font-bold">國文</th>
                                <th className="px-2 py-3 text-center text-violet-500 font-bold">英文</th>
                                <th className="px-2 py-3 text-center text-blue-500 font-bold">數學</th>
                                <th className="px-2 py-3 text-center font-bold text-emerald-500">總分</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-50'}`}>
                            {[...availableDates].sort(customDateSort).reverse().map((date, dateIndex) => {
                                const g = grades[date] || { chi: '', eng: '', math: '', total: '' };
                                return (
                                    <tr key={date} className={`${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50/80'} transition-colors`}>
                                        <td className="px-4 py-3 font-mono text-xs font-bold opacity-60">{date}</td>
                                        {['chi', 'eng', 'math'].map(sub => (
                                            <td key={sub} className="px-2 py-2 text-center">
                                                <input id={`single-${dateIndex}-${sub}`} type="text" className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all ${darkMode ? 'focus:bg-slate-800 focus:border-emerald-500/50 text-slate-200' : 'focus:bg-white focus:border-emerald-200 text-slate-700'}`} value={g[sub]} onChange={(e) => handleGradeChange(date, sub, e.target.value)} onKeyDown={(e) => handleSingleKeyDown(e, dateIndex, sub)} onPaste={(e) => handleSinglePaste(e, dateIndex, sub)} placeholder="-" />
                                            </td>
                                        ))}
                                        <td className="px-2 py-2 text-center"><div className="text-base font-bold text-emerald-500 py-2">{g.total}</div></td>
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
            <div className={`backdrop-blur-xl p-8 rounded-[2.5rem] shadow-2xl border text-center relative overflow-hidden ${darkMode ? 'bg-slate-900/60 border-white/10 shadow-emerald-900/10' : 'bg-white/80 border-white shadow-emerald-50'}`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-blue-500 opacity-80"></div>
              <h2 className={`text-2xl font-bold mb-8 tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>查詢成績</h2>
              <div className={`w-full p-2 rounded-2xl border transition-all mb-6 ${darkMode ? 'bg-slate-950 border-white/10 focus-within:ring-2 focus-within:ring-emerald-500/20' : 'bg-slate-50 border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100'}`}>
                <input type="text" placeholder="請輸入學號" className={`w-full bg-transparent border-none px-4 py-3 outline-none text-xl uppercase font-bold text-center tracking-[0.1em] placeholder:text-sm placeholder:tracking-normal placeholder:font-medium ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400'}`} value={searchId} onChange={(e) => setSearchId(e.target.value)} />
              </div>
              <button onClick={handleParentSearch} disabled={loading} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:shadow-lg hover:shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 tracking-wide">{loading ? '查詢中...' : '開始查詢'}</button>
              {searchError && <p className="mt-6 text-red-500 text-xs font-bold bg-red-500/10 inline-block px-4 py-2 rounded-full animate-pulse">{searchError}</p>}
            </div>
            )}

            {viewData && (
              <div className={`rounded-[2.5rem] shadow-2xl overflow-hidden border animate-in fade-in slide-in-from-bottom-8 duration-500 ${darkMode ? 'bg-slate-900 border-white/5 shadow-black/50' : 'bg-white border-white/60 shadow-slate-200/50'}`}>
                <div className="bg-slate-950 text-white p-8 pb-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full -mr-20 -mt-20 blur-3xl opacity-10"></div>
                   <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-600 rounded-full -ml-10 -mb-10 blur-3xl opacity-10"></div>
                   <div className="relative z-10 flex justify-between items-start mb-6">
                       <div>
                           <div className="text-emerald-400 text-[9px] font-bold uppercase tracking-widest mb-2 border border-emerald-500/20 inline-block px-2 py-1 rounded">Student Profile</div>
                           <h3 className="text-3xl font-bold tracking-tighter text-white">{viewData.name}</h3>
                           <p className="text-slate-500 font-mono text-xs mt-1 font-bold">{viewData.id}</p>
                       </div>
                       <button onClick={() => setViewData(null)} className="text-slate-400 hover:text-white bg-white/5 p-2 rounded-full backdrop-blur-md transition-colors"><LogOut className="w-4 h-4"/></button>
                   </div>
                </div>

                <div className="p-6">
                  <div className={`flex p-1 mb-6 rounded-xl border overflow-x-auto justify-center ${darkMode ? 'bg-slate-950 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                      {PHASES.map(phase => (
                          <button key={phase.id} onClick={() => setActivePhase(phase.id)} className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${activePhase === phase.id ? (darkMode ? 'bg-slate-800 text-white shadow-sm border border-white/10' : 'bg-white text-slate-800 shadow-sm border border-slate-100') : 'text-slate-500 hover:text-slate-400'}`}>{phase.name}</button>
                      ))}
                  </div>

                  <div className={`flex p-1 rounded-2xl mb-8 justify-center ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
                      {['總分', '國文', '英文', '數學'].map(tab => {
                          const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                          const isActive = activeTab === tabKey;
                          const color = COLORS[tabKey].tailwind;
                          return (
                              <button key={tabKey} onClick={() => setActiveTab(tabKey)} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 ${isActive ? (darkMode ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-800 shadow-md') : 'text-slate-400'}`}>
                                {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full bg-${color}-500 mr-1.5 mb-0.5`}></span>}{tab}
                              </button>
                          )
                      })}
                  </div>

                  {(() => {
                      const filteredData = getPhaseData(viewData.chartData);
                      
                      // Determine max score for the current view to set Y-axis domain
                      let maxDomain = 100;
                      if (activeTab === 'total') maxDomain = 300;
                      else if (activeTab === 'math' && activePhase === 'mock') maxDomain = 120;
                      // Eng is 80 in mock but 100 fits in 100 domain, so 100 is safe.
                      
                      return (
                        <>
                          {activeTab === 'total' && <SingleSubjectChart data={filteredData} subjectKey="total" avgKey="avgTotal" colorKey="total" title="總分" domain={[0, 300]} isDarkMode={darkMode} />}
                          {activeTab === 'chi' && <SingleSubjectChart data={filteredData} subjectKey="chi" avgKey="avgChi" colorKey="chi" title="國文" domain={[0, 100]} isDarkMode={darkMode} />}
                          {activeTab === 'eng' && <SingleSubjectChart data={filteredData} subjectKey="eng" avgKey="avgEng" colorKey="eng" title="英文" domain={[0, 100]} isDarkMode={darkMode} />}
                          {activeTab === 'math' && <SingleSubjectChart data={filteredData} subjectKey="math" avgKey="avgMath" colorKey="math" title="數學" domain={[0, maxDomain]} isDarkMode={darkMode} />}
                        </>
                      );
                  })()}
                </div>
                
                <div className={`p-6 border-t ${darkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-50'}`}>
                    <h4 className={`font-bold mb-6 text-xs flex items-center justify-center gap-2 tracking-widest uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>詳細紀錄</h4>
                    <div className="space-y-4">
                        {getPhaseData(viewData.chartData).slice().reverse().map((d) => {
                             const totalRank = calculateRank(d.date, 'total', d.total);
                             return (
                             <div key={d.date} className={`group p-5 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-slate-950/50 border-white/5 hover:border-emerald-500/20' : 'bg-white border-slate-100 hover:border-emerald-100 hover:shadow-lg hover:shadow-emerald-50/20'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-xs font-bold text-slate-400 font-mono">{d.date}</span>
                                        <button onClick={() => openStatsModal(d.date, { total: d.total, chi: d.chi, eng: d.eng, math: d.math })} className={`text-[10px] px-2 py-1 rounded-lg transition-colors font-bold flex items-center gap-1 mt-1 border w-fit ${darkMode ? 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800 hover:text-white' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-emerald-50 hover:text-emerald-600'}`}>
                                            <BarChart3 className="w-3 h-3" /> 班級分佈
                                        </button>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-3xl font-bold tracking-tighter text-emerald-500`}>{f1(d.total)}</div>
                                        <div className="flex items-center justify-end gap-2 mt-1">
                                            {totalRank !== '-' && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Trophy className="w-3 h-3"/> #{totalRank}</span>}
                                            {d.avgTotal && <div className="text-[10px] font-bold text-slate-400 tracking-wide">Avg {f1(d.avgTotal)}</div>}
                                        </div>
                                    </div>
                                </div>
                                <div className={`grid grid-cols-3 gap-2 mt-3 pt-3 border-t ${darkMode ? 'border-white/5' : 'border-slate-50'}`}>
                                    {['chi', 'eng', 'math'].map(sub => {
                                        const subColor = sub === 'chi' ? 'text-rose-500' : sub === 'eng' ? 'text-violet-500' : 'text-blue-500';
                                        const subLabel = sub === 'chi' ? '國文' : sub === 'eng' ? '英文' : '數學';
                                        const subScore = d[sub];
                                        const subRank = calculateRank(d.date, sub, subScore);
                                        return (
                                            <div key={sub} className={`rounded-2xl p-2 text-center ${darkMode ? 'bg-slate-900' : 'bg-slate-50/50'}`}>
                                                <div className={`text-[9px] font-bold opacity-80 mb-0.5 ${subColor}`}>{subLabel}</div>
                                                <div className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{f1(subScore)}</div>
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

        {showAvgModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAvgModal(false)}>
              <div className={`rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in duration-300 ${darkMode ? 'bg-slate-900 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                  <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                      <h3 className={`text-xl font-bold flex items-center gap-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}><Edit3 className="w-5 h-5 text-indigo-500"/> 設定班級平均</h3>
                      <button onClick={() => setShowAvgModal(false)} className={`p-2 rounded-full transition ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}><X className="w-5 h-5"/></button>
                  </div>
                  <div className={`p-6 overflow-y-auto flex-1 ${darkMode ? 'bg-slate-950/30' : 'bg-slate-50/50'}`}>
                      <div className="mb-4 text-xs font-bold text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        系統已自動計算平均。若需調整，請直接修改。
                      </div>
                      <table className="w-full text-sm text-left">
                          <thead className={`text-xs uppercase sticky top-0 backdrop-blur z-10 ${darkMode ? 'text-slate-500 bg-slate-900/95' : 'text-slate-400 bg-slate-50/95'}`}>
                              <tr>
                                  <th className="px-4 py-4 font-bold tracking-wider">日期</th>
                                  <th className="px-2 py-4 text-center text-rose-500">國文</th>
                                  <th className="px-2 py-4 text-center text-violet-500">英文</th>
                                  <th className="px-2 py-4 text-center text-blue-500">數學</th>
                                  <th className="px-2 py-4 text-center text-emerald-500 font-bold">總分</th>
                              </tr>
                          </thead>
                          <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                              {[...availableDates].sort(customDateSort).reverse().map((date, dateIndex) => {
                                  const avg = classAverages[date] || { chi: '', eng: '', math: '', total: '' };
                                  return (
                                      <tr key={date} className={darkMode ? 'bg-transparent' : 'bg-white'}>
                                          <td className="px-4 py-3 font-mono font-bold text-slate-500">{date}</td>
                                          {['chi', 'eng', 'math', 'total'].map(sub => (
                                              <td key={sub} className="px-1 py-1.5">
                                                  <input id={`avg-${dateIndex}-${sub}`} type="number" className={`w-full text-center p-2 rounded-xl border outline-none transition-all font-bold ${darkMode ? 'bg-slate-800 border-transparent focus:bg-slate-700 focus:border-emerald-500/50 text-slate-200' : 'bg-slate-50 border-slate-100 focus:bg-white focus:border-indigo-300 text-slate-600'} ${sub==='total'?'text-emerald-500':''}`} value={avg[sub] || ''} onChange={(e) => handleManualAverageChange(date, sub, e.target.value)} onKeyDown={(e) => handleAvgKeyDown(e, dateIndex, sub)} onPaste={(e) => handleAvgPaste(e, dateIndex, sub)} placeholder="-" />
                                              </td>
                                          ))}
                                      </tr>
                                  )
                              })}
                          </tbody>
                      </table>
                  </div>
                  <div className={`p-6 border-t rounded-b-[2rem] flex justify-end gap-3 ${darkMode ? 'border-white/5 bg-slate-900' : 'border-slate-100 bg-white'}`}>
                      <button onClick={() => setShowAvgModal(false)} className={`px-6 py-3 rounded-xl font-bold transition text-sm ${darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100'}`}>取消</button>
                      <button onClick={saveManualClassAverages} className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 transition active:scale-95 text-sm">儲存設定</button>
                  </div>
              </div>
          </div>
        )}

        {statsModalData && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setStatsModalData(null)}>
              <div className={`rounded-[2.5rem] w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in duration-300 ${darkMode ? 'bg-slate-900 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                  <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                      <div>
                          <div className="text-xs font-bold text-slate-400 font-mono mb-1">{statsModalData.date}</div>
                          <h3 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}><BarChart3 className="w-5 h-5 text-emerald-500"/> 週次成績分析</h3>
                      </div>
                      <button onClick={() => setStatsModalData(null)} className={`p-2 rounded-full border transition ${darkMode ? 'bg-white/5 hover:bg-white/10 border-white/5 text-white' : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-500'}`}><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1">
                      <div className={`flex p-1 rounded-xl mb-6 justify-center ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}`}>
                          {['總分', '國文', '英文', '數學'].map(tab => {
                              const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                              const isActive = statsActiveTab === tabKey;
                              return (
                                  <button key={tabKey} onClick={() => setStatsActiveTab(tabKey)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isActive ? (darkMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}>{tab}</button>
                              )
                          })}
                      </div>
                      <div className="text-center mb-6">
                          <div className="text-xs font-bold text-slate-500 mb-1">我的成績</div>
                          <div className={`text-4xl font-bold tracking-tighter ${COLORS[statsActiveTab].tailwind === 'emerald' ? 'text-emerald-500' : COLORS[statsActiveTab].tailwind === 'rose' ? 'text-rose-500' : COLORS[statsActiveTab].tailwind === 'violet' ? 'text-violet-500' : 'text-blue-500'}`}>
                              {statsModalData.myGrades[statsActiveTab] || '-'}
                          </div>
                      </div>
                      <DistributionChart data={statsModalData[statsActiveTab]} colorKey={statsActiveTab} isDarkMode={darkMode} />
                      <div className={`mt-6 rounded-2xl p-4 text-xs leading-relaxed border text-center ${darkMode ? 'bg-slate-950 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                          <p className="font-bold mb-1 opacity-80">分析說明</p>
                          長條圖顯示班級成績分佈，亮色區塊為您目前所在的區間。
                      </div>
                  </div>
              </div>
          </div>
        )}

        {showAddStudentModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
              <div className={`rounded-[2.5rem] p-8 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300 ${darkMode ? 'bg-slate-900 border border-white/10' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-4 mb-8">
                      <div className="bg-emerald-500/10 p-4 rounded-2xl text-emerald-500"><UserPlus className="w-8 h-8" /></div>
                      <h3 className={`font-bold text-2xl ${darkMode ? 'text-white' : 'text-slate-800'}`}>建立新學生</h3>
                  </div>
                  <input type="text" placeholder="例如: 151200" className={`w-full p-4 rounded-2xl border-2 border-transparent text-center font-bold text-xl outline-none mb-8 uppercase tracking-widest transition-all ${darkMode ? 'bg-slate-950 text-white focus:border-emerald-500/50' : 'bg-slate-50 text-slate-800 focus:bg-white focus:border-emerald-200'}`} value={newStudentIdInput} onChange={(e) => setNewStudentIdInput(e.target.value)} autoFocus />
                  <div className="flex gap-3">
                      <button onClick={() => setShowAddStudentModal(false)} className={`flex-1 px-4 py-3.5 rounded-xl font-bold text-sm transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>取消</button>
                      <button onClick={handleAddNewStudent} className="flex-1 px-4 py-3.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 font-bold text-sm shadow-lg shadow-emerald-900/20 transition-all active:scale-95">確認</button>
                  </div>
              </div>
          </div>
        )}

        {(deleteTarget || studentToDelete) && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setDeleteTarget(null); setStudentToDelete(null); }}>
              <div className={`rounded-[2.5rem] p-8 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300 ${darkMode ? 'bg-slate-900 border border-white/10' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-4 mb-6">
                      <div className="bg-red-500/10 p-4 rounded-2xl text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                      <div><h3 className={`font-bold text-xl ${darkMode ? 'text-white' : 'text-slate-800'}`}>確認刪除</h3><p className="text-slate-400 text-xs mt-1 font-bold opacity-80">此動作無法復原</p></div>
                  </div>
                  <p className={`mb-8 text-sm font-medium leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    確定要刪除 <span className={`font-bold px-2 py-0.5 rounded-md mx-1 text-base ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}>{deleteTarget || studentToDelete?.name}</span> 的資料嗎？
                  </p>
                  <div className="flex gap-3 justify-end">
                      <button onClick={() => { setDeleteTarget(null); setStudentToDelete(null); }} className={`flex-1 px-4 py-3.5 rounded-xl font-bold text-sm transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>取消</button>
                      <button onClick={deleteTarget ? confirmDeleteDate : confirmDeleteStudent} className="flex-1 px-4 py-3.5 rounded-xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-lg shadow-red-900/20 transition-all active:scale-95">刪除</button>
                  </div>
              </div>
          </div>
        )}
      </main>
    </div>
  );
}