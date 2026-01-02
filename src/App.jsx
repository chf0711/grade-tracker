import React, { useState, useEffect, useMemo } from 'react';
// 確保安裝了這些套件: npm install recharts lucide-react firebase
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BookOpen, Users, Search, Save, Plus, Check, TrendingUp, BarChart3, X, Lock, CloudDownload, LayoutDashboard, GraduationCap, Calendar, Clipboard, LogOut, AlertTriangle, UserPlus, Sparkles, Edit3, Quote, Loader2, RefreshCw, Trash2, Layers } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

// --- Firebase Configuration Setup ---
// ★★★ 請將您原本的設定貼在下方大括號內 ★★★
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
  // 1. 嘗試使用 Canvas 環境變數 (僅供預覽使用)
  if (typeof __firebase_config !== 'undefined') {
    const config = JSON.parse(__firebase_config);
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    if (typeof __app_id !== 'undefined') appId = __app_id;
  } 
  // 2. 如果沒有環境變數，使用使用者提供的真實設定 (部署使用)
  else if (realFirebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
    if (!getApps().length) {
      app = initializeApp(realFirebaseConfig);
    } else {
      app = getApp();
    }
  } else {
    // 3. 如果都沒有，拋出警告 (純 UI 模式，無後端)
    console.warn("Firebase not configured. Using mock mode or limited functionality.");
  }

  if (app) {
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

// --- FULL DATASET (Initial Fallback) ---
// 這裡的日期只是預設值，網站啟動後會立刻從 Firebase 抓取您最新的完整日期清單覆蓋這裡
// 因為您說 Firebase 裡的日期是完整的，所以這裡留一個空的範本或舊的也沒關係，它會被取代。
const EXAM_DATES = [
  "04/12", "04/19", "04/26", "05/03", "05/10", "05/17", "05/24", "06/07", "06/14",
  "06/21", "06/28", "06/29", "07/12", "07/19", "07/21", "07/26", "08/02", "08/09", 
  "08/16", "08/30", "09/06", "09/13", "09/20", "09/27", "09/29", "10/04", 
  "10/11", "10/18", "10/25", "11/01", "11/08", "11/15", "11/29", "12/06", "12/13"
];

// --- Phase Configuration (階段設定) ---
// 定義顯示區間：[開始索引, 結束索引 (不包含)]
// 陣列索引從 0 開始計算
// 0~18 (前18筆) | 18~36 (中間18筆) | 36~100 (後面所有，包含10週模考)
const PHASES = [
    { id: 'p1', name: '第一階段 (1~18週)', range: [0, 18] },
    { id: 'p2', name: '第二階段 (19~36週)', range: [18, 36] },
    { id: 'mock', name: '模考衝刺班 (10週)', range: [36, 100] } // 設大一點確保能涵蓋所有剩下的
];

const COLORS = {
    total: { hex: '#10b981', tailwind: 'emerald', label: '總分' },
    chi:   { hex: '#3b82f6', tailwind: 'blue',    label: '國文' },
    eng:   { hex: '#8b5cf6', tailwind: 'violet',  label: '英文' },
    math:  { hex: '#f59e0b', tailwind: 'amber',   label: '數學' },
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
                  <Line name="班平均" type="monotone" dataKey={avgKey} stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="6 6" isAnimationActive={false} />
                  <Line name={title} type="monotone" dataKey={subjectKey} stroke={COLORS[colorKey].hex} strokeWidth={3} activeDot={{ r: 6, fill: COLORS[colorKey].hex, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={true} animationDuration={1500}/>
              </LineChart>
          </ResponsiveContainer>
        </div>
    </div>
);

// Consolidated Data (Filtered: 61 Students, Sorted by ID)
// ★★★ 已清空本地寫死資料，完全依賴 Firebase 雲端資料庫 ★★★
const RAW_STUDENT_RECORDS = [];

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
  
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [viewData, setViewData] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [activeTab, setActiveTab] = useState('total');
  
  // 新增狀態: 用於控制要顯示哪個階段的成績
  const [activePhase, setActivePhase] = useState('p2'); // 預設顯示第二階段 (最新)

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) {
            console.log("Waiting for Firebase Auth...");
            return;
        }
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
           await signInWithCustomToken(auth, __initial_auth_token);
        } else {
           await signInAnonymously(auth);
        }
      } catch (e) {
          console.error("Auth init error:", e);
      }
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

  const loadDates = async () => {
      if (!db) return;
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'));
          if (docSnap.exists() && docSnap.data().list) {
              setAvailableDates(docSnap.data().list);
          } else {
             await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: EXAM_DATES }, { merge: true });
             setAvailableDates(EXAM_DATES);
          }
      } catch(e) {}
  };

  const addDate = async () => {
      if (!newDateInput || availableDates.includes(newDateInput)) return;
      const newList = [...availableDates, newDateInput].sort();
      setAvailableDates(newList);
      setNewDateInput('');
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已新增日期: ${newDateInput}`); setTimeout(() => setStatusMsg(''), 2000);
  };

  const localComputedAverages = useMemo(() => {
      const avgs = {};
      availableDates.forEach(date => {
          let t=0, c=0, e=0, m=0;
          let count=0;
          RAW_STUDENT_RECORDS.forEach(s => {
              const grades = s.grades && s.grades[date];
              if (Array.isArray(grades) && grades.length >= 3) {
                  const math = parseFloat(grades[0]) || 0;
                  const eng = parseFloat(grades[1]) || 0;
                  const chi = parseFloat(grades[2]) || 0;
                  const total = math + eng + chi;
                  if(total > 0) { 
                      t += total; 
                      m += math;
                      e += eng;
                      c += chi;
                      count++; 
                  }
              }
          });
          if(count > 0) {
            avgs[date] = { 
                total: (t/count).toFixed(1),
                chi: (c/count).toFixed(1),
                eng: (e/count).toFixed(1),
                math: (m/count).toFixed(1),
            };
          }
      });
      return avgs;
  }, [availableDates]);

  const loadClassAverages = async () => {
      if (!db) {
          setClassAverages(localComputedAverages);
          return;
      }
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v17'));
          let dbAverages = {};
          if (docSnap.exists()) {
              dbAverages = docSnap.data().averages || {};
          }
          setClassAverages({ ...localComputedAverages, ...dbAverages });
      } catch (e) {
          setClassAverages(localComputedAverages);
      }
  };

  const handleManualAverageChange = (date, subject, value) => {
      setClassAverages(prev => ({
          ...prev,
          [date]: {
              ...prev[date],
              [subject]: value
          }
      }));
  };

  const saveManualClassAverages = async () => {
      if (!db) return;
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v17'), { averages: classAverages }, { merge: true });
          setStatusMsg("班平均儲存成功！");
          setTimeout(() => setStatusMsg(''), 2000);
          setShowAvgModal(false);
      } catch (e) {
          console.error(e);
          setStatusMsg("儲存失敗");
      }
  };

  const handleDeleteDate = (dateToDelete) => {
      setDeleteTarget(dateToDelete);
  };

  const confirmDeleteDate = async () => {
      if (!deleteTarget) return;
      const dateToDelete = deleteTarget;
      const newList = availableDates.filter(d => d !== dateToDelete);
      setAvailableDates(newList);
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已刪除日期: ${dateToDelete}`); setTimeout(() => setStatusMsg(''), 2000);
      setDeleteTarget(null);
  };

  const handleLoginSubmit = () => {
      if (passwordInput === 'Ben110705') { 
          setIsAuthenticated(true); 
          localStorage.setItem('teacher_auth', 'true');
          setMode('teacher'); 
          loadAllStudents();
      } else { 
          setLoginError(true); 
      }
  };

  const handleLogout = () => {
      setIsAuthenticated(false);
      localStorage.removeItem('teacher_auth');
      setMode('landing');
  };

  const calculateTotal = (chi, eng, math) => {
      const c = parseFloat(chi) || 0;
      const e = parseFloat(eng) || 0;
      const m = parseFloat(math) || 0;
      if (chi === '' && eng === '' && math === '') return '';
      return (c + e + m).toFixed(1);
  };

  const loadAllStudents = async () => {
      setLoading(true);
      try {
          let studentsMap = {};
          RAW_STUDENT_RECORDS.forEach(s => {
              studentsMap[s.id] = { ...s, grades: normalizeGrades(s.grades) };
          });
          if (db) {
              const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
              querySnapshot.forEach(doc => {
                  const data = doc.data();
                  if (studentsMap[data.id]) {
                      studentsMap[data.id] = { ...studentsMap[data.id], ...data, grades: { ...studentsMap[data.id].grades, ...data.grades } };
                  } else {
                      studentsMap[data.id] = data;
                  }
              });
          }
          const sortedStudents = Object.values(studentsMap).sort((a,b) => a.id.localeCompare(b.id));
          setAllStudentsData(sortedStudents);
      } catch (e) {
          console.error("Load all students error:", e);
      }
      setLoading(false);
  };

  const normalizeGrades = (grades) => {
      if (!grades) return {};
      const normalized = {};
      Object.keys(grades).forEach(date => {
          const g = grades[date];
          if (Array.isArray(g)) {
              const m = g[0] || 0;
              const e = g[1] || 0;
              const c = g[2] || 0;
              normalized[date] = { math: m, eng: e, chi: c, total: m + e + c };
          } else {
              normalized[date] = g;
          }
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
          if (docSnap.exists()) {
            data = docSnap.data();
          }
      }
      if (data) {
        setCurrentStudentId(data.id); 
        setStudentName(data.name);
        let loadedGrades = data.grades || {};
        availableDates.forEach(d => { if (!loadedGrades[d]) loadedGrades[d] = { chi: '', eng: '', math: '', total: '' }; });
        setGrades(loadedGrades); 
        setStatusMsg(`已載入：${data.name}`);
      } else {
        const localStudent = RAW_STUDENT_RECORDS.find(s => s.id === id);
        if (localStudent) {
             setCurrentStudentId(localStudent.id);
             setStudentName(localStudent.name);
             const gradesObj = {};
             availableDates.forEach(d => {
                 const g = localStudent.grades[d];
                 if (Array.isArray(g)) {
                    gradesObj[d] = { math: f1(g[0]), eng: f1(g[1]), chi: f1(g[2]), total: f1((g[0]||0)+(g[1]||0)+(g[2]||0)) };
                 } else {
                    gradesObj[d] = { chi: '', eng: '', math: '', total: '' };
                 }
             });
             setGrades(gradesObj);
             setStatusMsg(`已載入本地資料：${localStudent.name} (請記得儲存以建立雲端檔案)`);
        } else {
            setCurrentStudentId(id);
            setStudentName('');
            const gradesObj = {};
            availableDates.forEach(d => {
                gradesObj[d] = { chi: '', eng: '', math: '', total: '' };
            });
            setGrades(gradesObj);
            setStatusMsg('新學生模式：請輸入姓名並開始建檔。');
        }
      }
    } catch (e) { setStatusMsg('讀取錯誤'); }
    setLoading(false);
  };

  const handleAddNewStudent = () => {
      if(newStudentIdInput.trim()) {
          loadStudentForTeacher(newStudentIdInput.toUpperCase().trim());
          setShowAddStudentModal(false);
          setNewStudentIdInput('');
          setTeacherViewMode('single'); // Switch to single view for new student
      }
  };

  const handleGradeChange = (dateKey, subject, value) => {
    setGrades(prev => {
        const currentData = prev[dateKey] || { chi: '', eng: '', math: '', total: '' };
        const updatedData = { ...currentData, [subject]: value };
        if (subject !== 'total') {
            const chi = subject === 'chi' ? value : updatedData.chi;
            const eng = subject === 'eng' ? value : updatedData.eng;
            const math = subject === 'math' ? value : updatedData.math;
            updatedData.total = calculateTotal(chi, eng, math);
        }
        return { ...prev, [dateKey]: updatedData };
    });
  };

  const handleBatchGradeChange = (studentId, subject, value) => {
      setAllStudentsData(prev => prev.map(s => {
          if (s.id !== studentId) return s;
          const currentGrades = s.grades || {};
          const currentDateGrades = currentGrades[batchDate] || { chi: '', eng: '', math: '', total: '' };
          const updatedDateGrades = { ...currentDateGrades, [subject]: value };
          if (subject !== 'total') {
              const chi = subject === 'chi' ? value : updatedDateGrades.chi;
              const eng = subject === 'eng' ? value : updatedDateGrades.eng;
              const math = subject === 'math' ? value : updatedDateGrades.math;
              updatedDateGrades.total = calculateTotal(chi, eng, math);
          }
          return { ...s, grades: { ...currentGrades, [batchDate]: updatedDateGrades } };
      }));
  };

  const handleKeyDown = (e, studentIndex, subject) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          let nextStudentIndex = studentIndex;
          let nextSubject = subject;
          const subjects = ['chi', 'eng', 'math'];
          const subjectIndex = subjects.indexOf(subject);
          if (e.key === 'ArrowUp') {
              nextStudentIndex = Math.max(0, studentIndex - 1);
          } else if (e.key === 'ArrowDown') {
              nextStudentIndex = Math.min(allStudentsData.length - 1, studentIndex + 1);
          } else if (e.key === 'ArrowLeft') {
              if (subjectIndex > 0) nextSubject = subjects[subjectIndex - 1];
          } else if (e.key === 'ArrowRight') {
              if (subjectIndex < 2) nextSubject = subjects[subjectIndex + 1];
          }
          const nextInputId = `cell-${nextStudentIndex}-${nextSubject}`;
          const nextInput = document.getElementById(nextInputId);
          if (nextInput) {
              nextInput.focus();
              nextInput.select();
          }
      }
  };

  const handlePaste = (e, startStudentIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/);
      const subjects = ['chi', 'eng', 'math'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      if (rows.length === 0) return;
      const newStudentsData = [...allStudentsData];
      let updated = false;
      rows.forEach((row, rIndex) => {
          const studentIndex = startStudentIndex + rIndex;
          if (studentIndex >= newStudentsData.length) return;
          const cols = row.split('\t');
          const student = { ...newStudentsData[studentIndex] };
          const currentGrades = student.grades || {};
          const currentDateGrades = { ...(currentGrades[batchDate] || { chi: '', eng: '', math: '', total: '' }) };
          cols.forEach((val, cIndex) => {
              const subjectIndex = startSubjectIndex + cIndex;
              if (subjectIndex >= 3) return;
              const subject = subjects[subjectIndex];
              const cleanVal = val.trim();
              if (cleanVal) {
                  currentDateGrades[subject] = cleanVal;
                  updated = true;
              }
          });
          currentDateGrades.total = calculateTotal(currentDateGrades.chi, currentDateGrades.eng, currentDateGrades.math);
          student.grades = { ...currentGrades, [batchDate]: currentDateGrades };
          newStudentsData[studentIndex] = student;
      });
      if (updated) {
          setAllStudentsData(newStudentsData);
          setStatusMsg(`已貼上 ${rows.length} 筆資料`);
          setTimeout(() => setStatusMsg(''), 2000);
      }
  };

  const handleDeleteStudent = () => {
    if (!currentStudentId) return;
    setStudentToDelete({ id: currentStudentId, name: studentName });
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    setStatusMsg(`正在刪除 ${studentToDelete.name}...`);
    try {
        if (db) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${studentToDelete.id}`));
        }
        setAllStudentsData(prev => prev.filter(s => s.id !== studentToDelete.id));
        setCurrentStudentId(null);
        setStudentName('');
        setGrades({});
        setStatusMsg(`已刪除學生: ${studentToDelete.name}`);
        setTimeout(() => setStatusMsg(''), 2000);
        setStudentToDelete(null);
    } catch (e) {
        console.error("Delete Error", e);
        setStatusMsg("刪除失敗，請稍後再試");
    }
  };

  const handleSaveGrades = async () => {
    if (!user || !currentStudentId) return;
    if (!studentName.trim()) {
        setStatusMsg('請輸入學生姓名！');
        return;
    }
    setStatusMsg('儲存中...');
    try {
      if (db) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${currentStudentId}`), { 
              id: currentStudentId, 
              name: studentName, 
              grades: grades, 
              lastUpdated: new Date().toISOString()
          }, { merge: true });
      } else {
          console.warn("No DB connection, changes only saved locally in RAM.");
      }
      setAllStudentsData(prev => {
          const exists = prev.find(s => s.id === currentStudentId);
          if(exists) return prev.map(s => s.id === currentStudentId ? { ...s, name: studentName, grades } : s);
          return [...prev, { id: currentStudentId, name: studentName, grades }].sort((a,b) => a.id.localeCompare(b.id));
      });
      setStatusMsg('儲存成功！'); setTimeout(() => setStatusMsg(''), 2000);
    } catch (e) { setStatusMsg('儲存失敗'); }
  };

  const handleSaveBatchGrades = async () => {
      setStatusMsg("批次儲存中...");
      try {
          if (db) {
              const batchPromises = allStudentsData.map(student => {
                  return setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${student.id}`), {
                      id: student.id,
                      name: student.name,
                      grades: student.grades,
                      lastUpdated: new Date().toISOString()
                  }, { merge: true });
              });
              await Promise.all(batchPromises);
              setStatusMsg("全班成績儲存成功！"); setTimeout(() => setStatusMsg(''), 2000);
          } else {
              setStatusMsg("無資料庫連線，僅本地更新");
          }
      } catch (e) {
          console.error(e);
          setStatusMsg("儲存失敗，請重試");
      }
  };

  const handleParentSearch = async () => {
    if (!user || !searchId.trim()) return;
    setSearchError(''); setViewData(null); setLoading(true);
    try {
      let data = null;
      if (db) {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${searchId.toUpperCase()}`);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              data = docSnap.data();
          }
      }
      if (!data) {
          const localStudent = RAW_STUDENT_RECORDS.find(s => s.id === searchId.toUpperCase());
          if (localStudent) {
              const gradesObj = {};
              availableDates.forEach(d => {
                 const g = localStudent.grades[d];
                 if (Array.isArray(g)) {
                    gradesObj[d] = { math: f1(g[0]), eng: f1(g[1]), chi: f1(g[2]), total: f1((g[0]||0)+(g[1]||0)+(g[2]||0)) };
                 }
              });
              data = { id: localStudent.id, name: localStudent.name, grades: gradesObj };
          }
      }

      if (data) {
        // --- 核心修改：分階段過濾數據 ---
        // 這裡會先準備所有數據，但在 render 時再根據 activePhase 過濾
        // 為了讓 SingleSubjectChart 收到正確的資料，我們在這裡先全部計算
        // 但其實 UI 層級會決定要顯示哪一段
        const allChartData = [];
        const sortedDates = [...availableDates].sort(); 

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
        
        // 計算總平均 (基於全部數據)
        const avg = allChartData.length > 0 ? (allChartData.reduce((a,b)=>a+b.total,0)/allChartData.length).toFixed(1) : 0;
        setViewData({ ...data, chartData: allChartData, average: avg });
      } else { setSearchError('查無此學號'); }
    } catch (e) { setSearchError('系統忙碌，請稍後再試'); }
    setLoading(false);
  };

  // Helper to filter data based on active phase
  const getPhaseData = (fullData) => {
      if (!fullData) return [];
      const currentPhaseConfig = PHASES.find(p => p.id === activePhase) || PHASES[0];
      const [start, end] = currentPhaseConfig.range;
      // 因為 chartData 是動態生成的，可能比 range 長或短
      // 我們這裡假設 chartData 的順序是跟著 EXAM_DATES 排序的
      // 但最安全的方式是根據日期索引過濾
      // 這裡簡化邏輯：直接對過濾後的 chartData 做 slice 可能不準確，因為 chartData 可能有缺漏
      // 正確做法：根據 EXAM_DATES 的 index 來決定這個 date 是否屬於該 phase
      
      const targetDates = availableDates.slice(start, end);
      return fullData.filter(d => targetDates.includes(d.date));
  };

  if (!user && !db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono">系統初始化中，請稍候... (請確認 Firebase 設定)</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono">系統連線中...</div>;

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-700 selection:bg-emerald-100 pb-20">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-30 border-b border-white/20 shadow-sm transition-all duration-300">
        <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer active:scale-95 transition" onClick={() => setMode('landing')}>
            <div className="bg-gradient-to-br from-emerald-400 to-teal-600 text-white p-2.5 rounded-2xl shadow-lg shadow-emerald-200/50"><GraduationCap className="h-5 w-5" /></div>
            <div><h1 className="text-xl font-black tracking-tight text-slate-800">小六私中A班</h1><p className="text-[11px] text-slate-500 font-bold tracking-widest uppercase">Learning Tracker</p></div>
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
                <div className="inline-flex items-center justify-center p-4 md:p-6 bg-white rounded-full shadow-2xl shadow-emerald-100 mb-2 ring-4 md:ring-8 ring-white"><Sparkles className="w-8 h-8 md:w-12 md:h-12 text-emerald-500" /></div>
                
                <div className="flex flex-col items-center justify-center">
                    <p className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">Making Progress Visible</p>
                </div>
            </div>
            <div className="w-full max-w-sm space-y-4 pt-4">
               <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className="group w-full bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white hover:border-emerald-100 flex items-center gap-5 hover:scale-[1.02] transition-all duration-300 active:scale-95">
                  <div className="bg-emerald-50 group-hover:bg-emerald-100 w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-600 transition-colors"><LayoutDashboard className="w-7 h-7" /></div>
                  <div className="text-left"><h3 className="text-xl font-bold text-slate-800">老師專用通道</h3><p className="text-xs text-slate-400 mt-1 font-medium">成績管理與班級設定</p></div>
               </button>
               <button onClick={() => setMode('parent')} className="group w-full bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white hover:border-blue-100 flex items-center gap-5 hover:scale-[1.02] transition-all duration-300 active:scale-95">
                  <div className="bg-blue-50 group-hover:bg-blue-100 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-600 transition-colors"><BarChart3 className="w-7 h-7" /></div>
                  <div className="text-left"><h3 className="text-xl font-bold text-slate-800">家長查詢入口</h3><p className="text-xs text-slate-400 mt-1 font-medium">輸入學號查看分析報告</p></div>
               </button>
            </div>
          </div>
        )}

        {mode === 'teacher_login' && (
            <div className="flex items-center justify-center min-h-[60vh] px-4 animate-in fade-in">
                <div className="bg-white/80 backdrop-blur-xl p-6 md:p-10 rounded-[2.5rem] shadow-2xl shadow-emerald-100/50 w-full max-w-sm text-center border border-white mx-auto">
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
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                {/* 日期管理區塊 */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 text-slate-800 font-bold"><Calendar className="w-5 h-5 text-emerald-500"/>管理日期</div>
                        <div className="flex gap-2">
                             <input type="text" placeholder="MM/DD" className="w-24 p-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-center font-bold outline-none focus:border-emerald-400 transition-colors tracking-widest" value={newDateInput} onChange={e=>setNewDateInput(e.target.value)} />
                             <button onClick={addDate} className="bg-slate-800 text-white px-3 rounded-xl hover:bg-black transition-colors"><Plus className="w-4 h-4"/></button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-100">
                        {[...availableDates].reverse().map(d => (
                            <div key={d} className="flex items-center bg-white px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 shadow-sm border border-slate-100">
                                {d} <button onClick={() => handleDeleteDate(d)} className="ml-2 text-slate-300 hover:text-red-500 transition-colors"><X className="w-3 h-3"/></button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 檢視模式切換 */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                     <button 
                        onClick={() => setTeacherViewMode('single')}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${teacherViewMode==='single' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        個人檢視
                      </button>
                      <button 
                        onClick={() => setTeacherViewMode('batch')}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${teacherViewMode==='batch' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        週次檢視 (批量輸入)
                      </button>
                </div>

                {/* 學生操作區塊 (Single Mode) */}
                {teacherViewMode === 'single' && (
                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <input id="loadIdInput" type="text" placeholder="輸入學號..." className="w-full p-3 pl-10 rounded-xl bg-slate-50 border-none text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-100 uppercase tracking-widest placeholder:tracking-normal" />
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                            </div>
                            <button onClick={() => document.getElementById('loadIdInput').value && loadStudentForTeacher(document.getElementById('loadIdInput').value.toUpperCase())} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors">載入</button>
                            <button onClick={() => setShowAddStudentModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-emerald-200 whitespace-nowrap transition-all active:scale-95"><UserPlus className="w-4 h-4"/> 新增</button>
                        </div>
                        <div className="mt-3 text-right">
                            <button onClick={() => setShowAvgModal(true)} className="text-xs font-bold text-indigo-500 hover:text-indigo-700 flex items-center justify-end gap-1 ml-auto px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"><Edit3 className="w-4 h-4"/> 設定班級平均</button>
                        </div>
                    </div>
                )}

                {/* 學生操作區塊 (Batch Mode) */}
                {teacherViewMode === 'batch' && (
                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-500">選擇日期：</span>
                                <select 
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400"
                                    value={batchDate}
                                    onChange={(e) => setBatchDate(e.target.value)}
                                >
                                    {[...availableDates].reverse().map(d => <option key={d} value={d}>{d}</option>)}
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
                                        <th className="px-2 py-3 text-center font-bold text-emerald-600 bg-slate-50">總分(Auto)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 bg-white">
                                    {allStudentsData.map((student, sIndex) => {
                                        const dateGrades = (student.grades && student.grades[batchDate]) || { chi: '', eng: '', math: '', total: '' };
                                        return (
                                            <tr key={student.id} className="hover:bg-slate-50/80">
                                                <td className="px-2 py-2 text-center">
                                                    <div className="text-xs font-bold text-slate-400">{sIndex + 1}</div>
                                                </td>
                                                <td className="px-4 py-2 font-mono text-xs font-bold text-slate-400">{student.id}</td>
                                                <td className="px-4 py-2 font-bold text-slate-700">{student.name}</td>
                                                {['chi', 'eng', 'math'].map((sub, cIndex) => (
                                                    <td key={sub} className="px-1 py-2">
                                                        <input 
                                                            id={`cell-${sIndex}-${sub}`}
                                                            type="text" 
                                                            className="w-full text-center p-2 rounded-lg bg-slate-50 focus:bg-white border border-transparent focus:border-emerald-200 outline-none text-sm font-bold text-slate-600 transition-all"
                                                            value={dateGrades[sub]}
                                                            onChange={(e) => handleBatchGradeChange(student.id, sub, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, sIndex, sub)}
                                                            onPaste={(e) => handlePaste(e, sIndex, sub)}
                                                            placeholder="-"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-1 py-2 text-center">
                                                    <div className="py-2 text-sm font-black text-emerald-600">{dateGrades.total}</div>
                                                </td>
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
            
            {/* Single Student Edit Mode */}
            {teacherViewMode === 'single' && currentStudentId && !loading && (
              <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-white overflow-hidden animate-in fade-in duration-500">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm">
                  <div className="flex-1 mr-4">
                      <input 
                        type="text" 
                        value={studentName} 
                        onChange={(e) => setStudentName(e.target.value)} 
                        className="text-2xl font-black text-slate-800 bg-transparent border-b-2 border-transparent focus:border-emerald-400 outline-none w-full placeholder:text-slate-300 transition-all tracking-wide"
                        placeholder="學生姓名"
                      />
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
                                <th className="px-2 py-4 text-center font-black text-emerald-600">總分 (Auto)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {[...availableDates].reverse().map(date => {
                                const g = grades[date] || { chi: '', eng: '', math: '', total: '' };
                                return (
                                    <tr key={date} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-sm font-bold text-slate-400">{date}</td>
                                        {['chi', 'eng', 'math'].map(sub => (
                                            <td key={sub} className="px-2 py-4 text-center">
                                                <input type="text" className="w-full text-center p-2.5 rounded-xl bg-transparent focus:bg-white border border-transparent focus:border-emerald-200 focus:shadow-sm outline-none text-base font-bold transition-all text-slate-600" value={g[sub]} onChange={(e) => handleGradeChange(date, sub, e.target.value)} placeholder="-" />
                                            </td>
                                        ))}
                                        <td className="px-2 py-4 text-center">
                                            <div className="text-base font-black text-emerald-600 py-2">{g.total}</div>
                                        </td>
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
            <div className="bg-white/80 backdrop-blur-xl p-10 rounded-[2.5rem] shadow-2xl shadow-emerald-50 border border-white text-center">
              <h2 className="text-3xl font-black text-slate-800 mb-10 tracking-tight">查詢成績</h2>
              <div className="flex bg-slate-50 p-4 rounded-3xl border border-slate-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-100 focus-within:border-emerald-200 transition-all shadow-inner mb-8">
                <input type="text" placeholder="請輸入學號" className="flex-1 bg-transparent border-none px-4 py-2 outline-none text-2xl text-slate-800 placeholder:text-slate-300 uppercase font-bold text-center tracking-[0.2em] placeholder:tracking-normal" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
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
                  {/* --- New Phase Tabs --- */}
                  <div className="flex bg-slate-50 p-1 mb-4 rounded-xl border border-slate-100 overflow-x-auto">
                      {PHASES.map(phase => (
                          <button
                            key={phase.id}
                            onClick={() => setActivePhase(phase.id)}
                            className={`flex-1 whitespace-nowrap px-4 py-2 text-xs font-bold rounded-lg transition-all ${activePhase === phase.id ? 'bg-white text-slate-800 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                              {phase.name}
                          </button>
                      ))}
                  </div>

                  {/* 分頁按鈕 - 更新樣式 */}
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8 shadow-inner">
                      {['總分', '國文', '英文', '數學'].map(tab => {
                          const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                          const isActive = activeTab === tabKey;
                          const color = COLORS[tabKey].tailwind;
                          return (
                              <button 
                                key={tabKey}
                                onClick={() => setActiveTab(tabKey)}
                                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all duration-300 ${isActive ? 'bg-white text-slate-800 shadow-md transform scale-100' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full bg-${color}-500 mr-2 mb-0.5`}></span>}
                                {tab}
                              </button>
                          )
                      })}
                  </div>

                  {/* Chart Rendering with Filtered Data */}
                  {(() => {
                      // Filter logic inside render
                      const filteredData = getPhaseData(viewData.chartData);
                      
                      return (
                        <>
                          {activeTab === 'total' && (
                              <SingleSubjectChart data={filteredData} subjectKey="total" avgKey="avgTotal" colorKey="total" title="總分" domain={[100, 300]} />
                          )}
                          {activeTab === 'chi' && (
                              <SingleSubjectChart data={filteredData} subjectKey="chi" avgKey="avgChi" colorKey="chi" title="國文" domain={[0, 100]} />
                          )}
                          {activeTab === 'eng' && (
                              <SingleSubjectChart data={filteredData} subjectKey="eng" avgKey="avgEng" colorKey="eng" title="英文" domain={[0, 100]} />
                          )}
                          {activeTab === 'math' && (
                              <SingleSubjectChart data={filteredData} subjectKey="math" avgKey="avgMath" colorKey="math" title="數學" domain={[0, 100]} />
                          )}
                        </>
                      );
                  })()}
                </div>
                
                {/* 成績列表 - 視覺優化 */}
                <div className="bg-white p-6 border-t border-slate-50">
                    <h4 className="font-bold text-slate-800 mb-6 text-sm flex items-center gap-2 tracking-wide"><Clipboard className="w-4 h-4 text-slate-400"/> 詳細紀錄</h4>
                    <div className="space-y-4">
                        {/* List also filtered by active phase, reversed */}
                        {getPhaseData(viewData.chartData).slice().reverse().map((d) => (
                             <div key={d.date} className="group bg-white p-5 rounded-3xl border border-slate-100 hover:border-emerald-100 hover:shadow-xl hover:shadow-emerald-50/50 transition-all duration-300 flex justify-between items-center">
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs font-bold text-slate-400 font-mono group-hover:text-emerald-500 transition-colors tracking-wide">{d.date}</span>
                                    <div className="flex gap-5 text-xs font-bold text-slate-500">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span>{f1(d.chi)}</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500"></span>{f1(d.eng)}</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span>{f1(d.math)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-3xl font-black tracking-tight text-emerald-500`}>{f1(d.total)}</div>
                                    {d.avgTotal && <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wide mt-1">Avg {f1(d.avgTotal)}</div>}
                                </div>
                             </div>
                        ))}
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
                                <th className="px-2 py-4 text-center text-blue-500">國文</th>
                                <th className="px-2 py-4 text-center text-violet-500">英文</th>
                                <th className="px-2 py-4 text-center text-amber-500">數學</th>
                                <th className="px-2 py-4 text-center text-emerald-600 font-bold">總分</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {[...availableDates].reverse().map(date => {
                                const avg = classAverages[date] || { chi: '', eng: '', math: '', total: '' };
                                return (
                                    <tr key={date} className="bg-white">
                                        <td className="px-4 py-3 font-mono font-bold text-slate-500">{date}</td>
                                        {['chi', 'eng', 'math', 'total'].map(sub => (
                                            <td key={sub} className="px-1 py-2">
                                                <input 
                                                    type="number" 
                                                    className={`w-full text-center p-2.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-bold ${sub==='total'?'text-emerald-600':'text-slate-600'}`}
                                                    value={avg[sub] || ''} 
                                                    onChange={(e) => handleManualAverageChange(date, sub, e.target.value)}
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

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-emerald-100 p-4 rounded-2xl text-emerald-600"><UserPlus className="w-8 h-8" /></div>
                    <h3 className="font-black text-2xl text-slate-800">建立新學生</h3>
                </div>
                <p className="text-slate-500 mb-3 text-sm font-bold ml-1">請輸入學生學號：</p>
                <input 
                    type="text" 
                    placeholder="例如: 151200" 
                    className="w-full p-5 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-emerald-200 text-center font-bold text-2xl text-slate-800 outline-none mb-10 uppercase tracking-widest transition-all" 
                    value={newStudentIdInput}
                    onChange={(e) => setNewStudentIdInput(e.target.value)}
                    autoFocus
                />
                <div className="flex gap-4">
                    <button onClick={() => setShowAddStudentModal(false)} className="flex-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-sm transition-colors">取消</button>
                    <button onClick={handleAddNewStudent} className="flex-1 px-4 py-4 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600 font-bold text-sm shadow-xl shadow-emerald-200 transition-all active:scale-95">確認新增</button>
                </div>
            </div>
        </div>
      )}

      {/* Delete Date Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-red-100 p-4 rounded-2xl text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                    <div>
                        <h3 className="font-black text-2xl text-slate-800">確認刪除</h3>
                        <p className="text-slate-400 text-xs mt-1 font-bold">此動作無法復原</p>
                    </div>
                </div>
                <p className="text-slate-600 mb-10 text-base font-medium leading-relaxed">確定要刪除 <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg mx-1 text-lg">{deleteTarget}</span> 的資料嗎？</p>
                <div className="flex gap-4 justify-end">
                    <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-sm transition-colors">取消</button>
                    <button onClick={confirmDeleteDate} className="flex-1 px-4 py-4 rounded-2xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-xl shadow-red-200 transition-all active:scale-95">確認刪除</button>
                </div>
            </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setStudentToDelete(null)}>
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-red-100 p-4 rounded-2xl text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                    <div>
                        <h3 className="font-black text-2xl text-slate-800">確認刪除學生</h3>
                        <p className="text-slate-400 text-xs mt-1 font-bold">此動作無法復原</p>
                    </div>
                </div>
                <p className="text-slate-600 mb-10 text-base font-medium leading-relaxed">確定要刪除學生 <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg mx-1 text-lg">{studentToDelete.name}</span> 嗎？<br/>這將會移除該生的所有成績紀錄。</p>
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