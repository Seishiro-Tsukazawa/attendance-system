// === Supabase設定 ===
const SUPABASE_URL = 'https://dnvanyyneuypcxowlsho.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudmFueXluZXV5cGN4b3dsc2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMDgzNjQsImV4cCI6MjA4MTg4NDM2NH0.fVRZ1FyDmHiHSAsEQ52HzWsgpB5V0OdGSxWXYY41eGI';

// Supabaseヘッダー（全てのfetchで使用）
const supabaseHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
};

// グローバル状態管理
const app = {
    currentUser: null,
    todayAttendance: null,
    allEmployees: [],
    allAttendance: [],
    filteredAttendance: [],
    compensatoryLeaves: [],
    paidLeaves: [],
    leaveRequests: []
};

// ユーティリティ関数
const utils = {
    // 現在の日付を取得 (YYYY-MM-DD)
    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    },
    
    // 現在の時刻を取得 (HH:MM)
    getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    },
    
    // 現在の日時をタイムスタンプ形式で取得 (ローカルタイム、タイムゾーン情報なし)
    getCurrentTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    },
    
    // 日付フォーマット (YYYY-MM-DD → YYYY年MM月DD日)
    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        const weekday = weekdays[date.getDay()];
        return `${year}年${month}月${day}日(${weekday})`;
    },
    
    // タイムスタンプから時刻を抽出 (ISO 8601 → HH:MM)
    formatTime(timestamp) {
        if (!timestamp) return '-';
        // タイムスタンプがYYYY-MM-DDTHH:MM:SS形式の場合、そのまま時刻部分を抽出
        if (typeof timestamp === 'string' && timestamp.includes('T')) {
            const timePart = timestamp.split('T')[1];
            if (timePart) {
                return timePart.substring(0, 5); // HH:MM部分を取得
            }
        }
        // それ以外の場合は従来の処理
        const date = new Date(timestamp);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },
    
    // 日付と時刻からタイムスタンプを作成 (YYYY-MM-DD + HH:MM → ISO 8601)
    createTimestamp(dateStr, timeStr) {
        if (!timeStr || timeStr === '-') return null;
        // YYYY-MM-DDTHH:MM:SS形式で返す（タイムゾーン情報なし）
        return `${dateStr}T${timeStr}:00`;
    },
    
    // 勤務時間計算（休憩時間を自動控除）
    calculateWorkHours(clockIn, clockOut) {
        if (!clockIn || !clockOut) return { workHours: 0, breakMinutes: 0 };
        
        const [inHour, inMin] = clockIn.split(':').map(Number);
        const [outHour, outMin] = clockOut.split(':').map(Number);
        
        const inMinutes = inHour * 60 + inMin;
        const outMinutes = outHour * 60 + outMin;
        const totalMinutes = outMinutes - inMinutes;
        
        // 休憩時間を自動控除（6時間以上勤務で45分、8時間以上で60分）
        let breakMinutes = 0;
        const workHours = totalMinutes / 60;
        if (workHours >= 8) {
            breakMinutes = 60;
        } else if (workHours >= 6) {
            breakMinutes = 45;
        }
        
        const actualWorkMinutes = totalMinutes - breakMinutes;
        return {
            workHours: Math.round((actualWorkMinutes / 60) * 10) / 10,
            breakMinutes: breakMinutes
        };
    },
    
    // 休日出勤の振替計算
    calculateCompensatory(workHours) {
        // 5時間以上: 1日分の振替
        // 5時間未満: 実時間の振替
        if (workHours >= 5) {
            return { days: 1, hours: 0 };
        } else {
            return { days: 0, hours: Math.round(workHours * 10) / 10 };
        }
    },
    
    // トースト通知表示
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toastIcon');
        const toastMessage = document.getElementById('toastMessage');
        
        const icons = {
            success: '<i class="fas fa-check-circle text-green-500 text-2xl"></i>',
            error: '<i class="fas fa-exclamation-circle text-red-500 text-2xl"></i>',
            info: '<i class="fas fa-info-circle text-blue-500 text-2xl"></i>'
        };
        
        toastIcon.innerHTML = icons[type];
        toastMessage.textContent = message;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
};

// API通信
const api = {
    // 従業員取得
    async getEmployees() {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=*`, {
            headers: supabaseHeaders
        });
        return await response.json();
    },
    
    // 従業員取得（社員番号で検索）
    async getEmployeeByNumber(employeeNumber) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/employees?employee_number=eq.${employeeNumber}&select=*`, {
            headers: supabaseHeaders
        });
        const result = await response.json();
        return result[0];
    },
    
    // 従業員追加
    async createEmployee(data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/employees`, {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 従業員更新
    async updateEmployee(id, data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${id}`, {
            method: 'PATCH',
            headers: supabaseHeaders,
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 従業員削除
    async deleteEmployee(id) {
        await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${id}`, {
            method: 'DELETE',
            headers: supabaseHeaders
        });
    },
    
    // 勤怠記録取得
    async getAttendance() {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance?select=*&order=date.desc`, {
            headers: supabaseHeaders
        });
        return await response.json();
    },
    
    // 勤怠記録取得（特定の従業員と日付）
    async getTodayAttendance(employeeId, date) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance?employee_id=eq.${employeeId}&date=eq.${date}&select=*`, {
            headers: supabaseHeaders
        });
        const result = await response.json();
        return result[0];
    },

    // 勤怠記録取得（従業員と期間指定）
    async getAttendanceByRange(employeeId, startDate, endDate) {
        const query = `${SUPABASE_URL}/rest/v1/attendance?employee_id=eq.${employeeId}&date=gte.${startDate}&date=lte.${endDate}&select=*`;
        const response = await fetch(query, {
            headers: supabaseHeaders
        });
        return await response.json();
    },
    
    // 勤怠記録作成
    async createAttendance(data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        console.log('createAttendance APIレスポンス:', result);
        // Supabaseは配列で返す
        return Array.isArray(result) ? result[0] : result;
    },
    
    // 勤怠記録更新
    async updateAttendance(id, data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/attendance?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    },
    
    // 勤怠記録削除
    async deleteAttendance(id) {
        await fetch(`${SUPABASE_URL}/rest/v1/attendance?id=eq.${id}`, {
            method: 'DELETE',
            headers: supabaseHeaders
        });
    },
    
    // 振替休暇取得
    async getCompensatoryLeaves() {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/compensatory_leave?select=*&order=work_date.desc`, {
            headers: supabaseHeaders
        });
        return await response.json();
    },
    
    // 振替休暇作成
    async createCompensatoryLeave(data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/compensatory_leave`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    },
    
    // 振替休暇更新
    async updateCompensatoryLeave(id, data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/compensatory_leave?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    },
    
    // 振替休暇削除（勤怠削除時に使用）
    async deleteCompensatoryLeaveByWorkDate(employeeId, workDate) {
        await fetch(`${SUPABASE_URL}/rest/v1/compensatory_leave?employee_id=eq.${employeeId}&work_date=eq.${workDate}`, {
            method: 'DELETE',
            headers: supabaseHeaders
        });
    },
    
    // 有給休暇取得
    async getPaidLeaves() {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/paid_leave?order=grant_date.desc`, {
            headers: supabaseHeaders
        });
        return await response.json();
    },
    
    // 有給申請取得
    async getLeaveRequests() {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?order=request_date.desc`, {
            headers: supabaseHeaders
        });
        return await response.json();
    },
    
    // 有給申請作成
    async createLeaveRequest(data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    },
    
    // 有給申請更新（承認/却下）
    async updateLeaveRequest(id, data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    },
    
    // 有給申請削除
    async deleteLeaveRequest(id) {
        await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${id}`, {
            method: 'DELETE',
            headers: supabaseHeaders
        });
    },
    
    // 有給休暇残日数更新
    async updatePaidLeave(id, data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/paid_leave?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    },
    
    // 有給休暇作成
    async createPaidLeave(data) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/paid_leave`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        return result[0];
    }
};

// ログイン処理
const auth = {
    async login(employeeNumber) {
        const employee = await api.getEmployeeByNumber(employeeNumber);

        if (!employee || employee.status !== 'active') {
            return { success: false, message: '社員番号が見つからないか、無効なアカウントです' };
        }

        app.currentUser = employee;
        localStorage.setItem('currentUser', JSON.stringify(employee));
        localStorage.setItem('lastEmployeeNumber', employeeNumber);

        // ログイン後に有給自動付与チェックを実行
        await this.checkAndGrantPaidLeave(employee);
        
        return { success: true, employee };
    },
    
    logout() {
        app.currentUser = null;
        localStorage.removeItem('currentUser');
        shiftSelection.resetSelection();
        showScreen('login');
    },
    
    checkAuth() {
        const stored = localStorage.getItem('currentUser');
        if (stored) {
            app.currentUser = JSON.parse(stored);
            return true;
        }
        return false;
    },
    
    // 有給自動付与チェック
    async checkAndGrantPaidLeave(employee) {
        try {
            const today = utils.getCurrentDate();
            
            // 従業員の入社日から有給付与が必要かチェック
            // 入社日がemployeeテーブルにあると仮定（ない場合は実装しない）
            if (!employee.hire_date) {
                return; // 入社日がない場合はスキップ
            }
            
            // 入社日から6ヶ月後、1年半後、2年半後...の有給付与日を計算
            const hireDate = new Date(employee.hire_date);
            const todayDate = new Date(today);
            
            // 既存の有給データを取得
            const existingLeaves = await api.getPaidLeaves();
            const employeeLeaves = existingLeaves.filter(pl => pl.employee_id === employee.id);
            
            // 付与予定日のリストを生成
            const grantDates = this.calculateGrantDates(hireDate, todayDate);
            
            let newGrantCount = 0;
            
            for (const grantInfo of grantDates) {
                // 既に付与済みかチェック
                const alreadyGranted = employeeLeaves.some(pl => 
                    pl.grant_date === grantInfo.date
                );
                
                if (!alreadyGranted && grantInfo.date <= today) {
                    // 未付与で付与日が過去または今日の場合、自動付与
                    await api.createPaidLeave({
                        employee_id: employee.id,
                        grant_date: grantInfo.date,
                        grant_days: grantInfo.days,
                        remaining_days: grantInfo.days,
                        used_days: 0,
                        expiry_date: this.calculateExpiryDate(grantInfo.date),
                        status: 'active'
                    });
                    newGrantCount++;
                }
            }
            
            if (newGrantCount > 0) {
                utils.showToast(`有給休暇 ${newGrantCount}件を自動付与しました`, 'success');
            }
        } catch (error) {
            console.error('有給自動付与チェックエラー:', error);
            // エラーが出てもログインは継続
        }
    },
    
    // 有給付与日を計算
    calculateGrantDates(hireDate, todayDate) {
        const grants = [];
        const years = Math.floor((todayDate - hireDate) / (365.25 * 24 * 60 * 60 * 1000));
        
        // 入社6ヶ月後: 10日
        const firstGrant = new Date(hireDate);
        firstGrant.setMonth(firstGrant.getMonth() + 6);
        if (firstGrant <= todayDate) {
            grants.push({
                date: firstGrant.toISOString().split('T')[0],
                days: 10,
                label: '入社6ヶ月'
            });
        }
        
        // その後は毎年付与（付与日数は勤続年数に応じて増加）
        const yearlyDays = [10, 11, 12, 14, 16, 18, 20, 20, 20, 20]; // 0.5年, 1.5年, 2.5年...
        
        for (let i = 1; i <= years && i < yearlyDays.length; i++) {
            const grantDate = new Date(hireDate);
            grantDate.setMonth(grantDate.getMonth() + 6 + (i * 12));
            
            if (grantDate <= todayDate) {
                grants.push({
                    date: grantDate.toISOString().split('T')[0],
                    days: yearlyDays[i],
                    label: `勤続${i + 0.5}年`
                });
            }
        }
        
        return grants;
    },
    
    // 有効期限を計算（付与日から2年後）
    calculateExpiryDate(grantDate) {
        const expiry = new Date(grantDate);
        expiry.setFullYear(expiry.getFullYear() + 2);
        return expiry.toISOString().split('T')[0];
    }
};

// 画面切り替え
function showScreen(screen) {
    if (screen === 'login') {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    } else {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }
}

// ビュー切り替え
function showView(viewName) {
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(`${viewName}View`).classList.remove('hidden');
    
    // ナビゲーションボタンの状態更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active', 'border-tsunagu-blue', 'text-tsunagu-blue');
        btn.classList.add('border-transparent', 'text-gray-600', 'hover:text-gray-800');
    });
    
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'border-tsunagu-blue', 'text-tsunagu-blue');
        activeBtn.classList.remove('border-transparent', 'text-gray-600');
    }
}

// 時計更新
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = utils.formatDate(utils.getCurrentDate());
    
    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');
    
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
}

// ログイン補助
const loginAssistant = {
    lastEmployeeNumber: null,

    init() {
        const stored = localStorage.getItem('lastEmployeeNumber');
        const badge = document.getElementById('lastEmployeeNumberBadge');
        const useBtn = document.getElementById('useLastEmployeeBtn');
        const input = document.getElementById('employeeNumber');

        if (stored) {
            this.lastEmployeeNumber = stored;
            if (badge) {
                badge.textContent = `前回: ${stored}`;
                badge.classList.remove('hidden');
            }
            if (useBtn) {
                useBtn.classList.remove('hidden');
                useBtn.addEventListener('click', () => {
                    input.value = stored;
                    input.focus();
                    this.validate(input.value);
                });
            }
            if (input && !input.value) {
                input.value = stored;
            }
        }

        if (input) {
            input.addEventListener('input', (e) => this.validate(e.target.value));
            this.validate(input.value);
        }
    },

    validate(value) {
        const validationEl = document.getElementById('employeeNumberValidation');
        const hint = document.getElementById('employeeNumberHint');
        if (!validationEl) return;

        const isValid = /^\d{3,}$/.test((value || '').trim());
        validationEl.textContent = isValid ? '入力形式 OK' : '半角数字で3桁以上入力してください';
        validationEl.className = `text-xs ${isValid ? 'text-green-600' : 'text-red-600'}`;

        if (hint) {
            hint.classList.toggle('text-green-700', isValid);
        }
        return isValid;
    }
};

// シフト選択管理
const shiftSelection = {
    selectedShift: null,
    defaultTripHours: { start: '08:30', end: '17:30' },

    init() {
        this.shiftRadios = Array.from(document.querySelectorAll('input[name="shiftType"]'));
        this.holidayToggle = document.getElementById('holidayWorkToggle');
        this.hintEl = document.getElementById('shiftSelectionHint');
        this.defaultHoursEl = document.getElementById('shiftDefaultHours');

        this.shiftRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.selectedShift = radio.value;
                this.updateHint();
                this.updateDefaultHours();
                clock.updateButtons();
            });
        });

        if (this.holidayToggle) {
            this.holidayToggle.addEventListener('change', () => {
                this.updateDefaultHours();
                clock.updateButtons();
            });
        }

        this.updateHint();
        this.updateDefaultHours();
    },

    applyAttendanceShift(shiftType) {
        if (!shiftType) return;

        // 休日出張は出張にチェックし、休日扱いトグルをONにする
        const normalized = shiftType === '休日出張' ? '出張' : shiftType;
        const targetRadio = this.shiftRadios.find(radio => radio.value === normalized);

        if (targetRadio) {
            targetRadio.checked = true;
            this.selectedShift = normalized;

            if (this.holidayToggle) {
                const shouldEnableHoliday = shiftType === '休日出張';
                this.holidayToggle.checked = shouldEnableHoliday;
            }

            this.updateHint();
            this.updateDefaultHours();
        }
    },

    resetSelection() {
        this.shiftRadios.forEach(radio => (radio.checked = false));
        if (this.holidayToggle) {
            this.holidayToggle.checked = false;
        }
        this.selectedShift = null;
        this.updateHint();
        this.updateDefaultHours();
    },

    getCurrentShift() {
        if (!this.selectedShift) return null;
        if (this.selectedShift === '出張' && this.holidayToggle?.checked) {
            return '休日出張';
        }
        return this.selectedShift;
    },

    updateHint() {
        if (!this.hintEl) return;
        const hasSelection = Boolean(this.selectedShift);
        this.hintEl.textContent = hasSelection
            ? '選択中のシフトで打刻を記録します。'
            : 'シフトを選択すると打刻ボタンが有効になります。';
        this.hintEl.classList.toggle('text-red-600', !hasSelection);
        this.hintEl.classList.toggle('text-green-700', hasSelection);
    },

    updateDefaultHours() {
        if (!this.defaultHoursEl) return;
        const shift = this.getCurrentShift();

        if (shift && shift.includes('出張')) {
            this.defaultHoursEl.textContent = `出張の初期値: ${this.defaultTripHours.start}〜${this.defaultTripHours.end}（変更可）`;
            this.defaultHoursEl.classList.remove('hidden');
        } else {
            this.defaultHoursEl.textContent = '';
            this.defaultHoursEl.classList.add('hidden');
        }
    }
};

// 打刻処理
const clock = {
    async clockIn() {
        const shiftType = shiftSelection.getCurrentShift();
        if (!shiftType) {
            utils.showToast('シフトを選択してください', 'error');
            return;
        }
        const clockInTime = utils.getCurrentTimestamp(); // タイムスタンプ形式に変更
        const date = utils.getCurrentDate();
        
        try {
            const attendance = await api.createAttendance({
                employee_id: app.currentUser.id,
                date: date,
                shift_type: shiftType,
                clock_in: clockInTime,
                break_minutes: 0,
                work_hours: 0,
                note: '',
                status: 'pending'
            });
            
            console.log('出勤データ作成結果:', attendance);
            console.log('attendance.id:', attendance?.id);
            console.log('attendance.clock_out:', attendance?.clock_out);
            
            if (!attendance || !attendance.id) {
                throw new Error('出勤データの作成に失敗しました');
            }
            
            app.todayAttendance = attendance;
            console.log('app.todayAttendance設定完了:', app.todayAttendance);
            
            this.updateTodayStatus();
            this.updateButtons();
            utils.showToast('出勤を記録しました', 'success');
        } catch (error) {
            console.error('出勤エラー:', error);
            utils.showToast('出勤の記録に失敗しました', 'error');
        }
    },
    
    async clockOut() {
        const clockOutTime = utils.getCurrentTimestamp(); // タイムスタンプ形式に変更
        
        // clock_inとclock_outから時刻部分を抽出して勤務時間を計算
        const clockInDate = new Date(app.todayAttendance.clock_in);
        const clockOutDate = new Date(clockOutTime);
        const diffMinutes = (clockOutDate - clockInDate) / 1000 / 60;
        const diffHours = diffMinutes / 60;
        
        // 休憩時間を自動控除（6時間以上勤務で45分、8時間以上で60分）
        let breakMinutes = 0;
        if (diffHours >= 8) {
            breakMinutes = 60;
        } else if (diffHours >= 6) {
            breakMinutes = 45;
        }
        
        const actualWorkMinutes = diffMinutes - breakMinutes;
        const workHours = Math.round((actualWorkMinutes / 60) * 10) / 10;
        
        // 残業時間を計算（8時間を超えた分）
        const overtimeHours = workHours > 8 ? Math.round((workHours - 8) * 10) / 10 : 0;
        
        try {
            const updatedData = {
                clock_out: clockOutTime,
                break_minutes: breakMinutes,
                work_hours: workHours,
                overtime_hours: overtimeHours
            };
            
            const updated = await api.updateAttendance(app.todayAttendance.id, updatedData);
            app.todayAttendance = updated;

            // 休日出勤の場合、振替休暇を記録（休日出張含む）
            if (['休日出勤', '休日出張'].includes(app.todayAttendance.shift_type)) {
                const comp = utils.calculateCompensatory(workHours);
                await api.createCompensatoryLeave({
                    employee_id: app.currentUser.id,
                    work_date: app.todayAttendance.date,
                    work_hours: workHours,
                    substitute_days: comp.days,
                    substitute_hours: comp.hours,
                    used: false,
                    used_date: null
                });
            }

            this.updateTodayStatus();
            this.updateButtons();
            await this.updateMonthlyOvertime();
            utils.showToast('退勤を記録しました', 'success');
        } catch (error) {
            console.error('退勤エラー:', error);
            utils.showToast('退勤の記録に失敗しました', 'error');
        }
    },
    
    updateTodayStatus() {
        const statusContent = document.getElementById('todayStatusContent');
        
        if (!app.todayAttendance) {
            statusContent.innerHTML = '<p class="text-gray-600">まだ出勤していません</p>';
            return;
        }
        
        const { clock_in, clock_out, shift_type, work_hours } = app.todayAttendance;
        
        let html = `
            <div class="grid grid-cols-2 gap-2 sm:gap-3 text-xs md:text-sm">
                <div>
                    <div class="text-[11px] text-gray-600">シフト</div>
                    <div class="text-base md:text-lg font-bold text-tsunagu-blue">${shift_type}</div>
                </div>
                <div>
                    <div class="text-[11px] text-gray-600">出勤時刻</div>
                    <div class="text-base md:text-lg font-bold text-tsunagu-green">${utils.formatTime(clock_in)}</div>
                </div>
        `;
        
        if (clock_out) {
            html += `
                <div>
                    <div class="text-[11px] text-gray-600">退勤時刻</div>
                    <div class="text-base md:text-lg font-bold text-tsunagu-red">${utils.formatTime(clock_out)}</div>
                </div>
                <div>
                    <div class="text-[11px] text-gray-600">勤務時間</div>
                    <div class="text-base md:text-lg font-bold text-gray-800">${work_hours}時間</div>
                </div>
            `;
        }
        
        html += '</div>';
        statusContent.innerHTML = html;
    },
    
    updateButtons() {
        const clockInBtn = document.getElementById('clockInBtn');
        const clockOutBtn = document.getElementById('clockOutBtn');
        const resetBtnContainer = document.getElementById('resetBtnContainer');

        const hasShiftSelection = Boolean(shiftSelection.getCurrentShift());

        if (!app.todayAttendance || !app.todayAttendance.id) {
            // 出勤データなし → シフト未選択なら両方無効、選択済みなら出勤ボタンのみ有効
            clockInBtn.disabled = !hasShiftSelection;
            clockOutBtn.disabled = true;
            resetBtnContainer.classList.add('hidden');
        } else if (app.todayAttendance.clock_out) {
            // 退勤済み（clock_outに値がある） → 両方無効、リセットボタン表示
            clockInBtn.disabled = true;
            clockOutBtn.disabled = true;
            resetBtnContainer.classList.remove('hidden');
        } else {
            // 出勤済み・未退勤 → 退勤ボタンのみ有効、リセットボタン表示
            clockInBtn.disabled = true;
            clockOutBtn.disabled = false;
            resetBtnContainer.classList.remove('hidden');
        }
    },

    async updateMonthlyOvertime(useCached = false) {
        const valueEl = document.getElementById('monthlyOvertimeValue');
        const rangeEl = document.getElementById('monthlyOvertimeRange');
        if (!valueEl || !rangeEl) return;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0];

        rangeEl.textContent = `${year}年${month}月`;
        valueEl.textContent = '集計中...';

        try {
            let attendanceList = [];

            if (useCached && app.allAttendance.length > 0) {
                attendanceList = app.allAttendance;
            } else {
                attendanceList = await api.getAttendanceByRange(app.currentUser.id, startDate, endDate);
            }

            const personalRecords = attendanceList.filter(att =>
                att.employee_id === app.currentUser.id &&
                att.date >= startDate && att.date <= endDate &&
                att.clock_out
            );

            const overtimeHours = personalRecords.reduce((sum, att) => sum + (att.overtime_hours || 0), 0);
            valueEl.textContent = `${Math.round(overtimeHours * 10) / 10}時間`;
        } catch (error) {
            console.error('残業時間集計エラー:', error);
            valueEl.textContent = '—';
        }
    },

    async loadTodayAttendance() {
        const today = utils.getCurrentDate();
        app.todayAttendance = await api.getTodayAttendance(app.currentUser.id, today);
        shiftSelection.applyAttendanceShift(app.todayAttendance?.shift_type);
        this.updateTodayStatus();
        this.updateButtons();
        await this.updateMonthlyOvertime();
    },
    
    async resetClock() {
        if (!app.todayAttendance || !app.todayAttendance.id) return;
        
        if (!confirm('本日の打刻データをリセットしますか？\nこの操作は取り消せません。')) return;
        
        try {
            // 休日出勤の場合、対応する振替休暇も削除（休日出張含む）
            if (['休日出勤', '休日出張'].includes(app.todayAttendance.shift_type)) {
                await api.deleteCompensatoryLeaveByWorkDate(
                    app.todayAttendance.employee_id,
                    app.todayAttendance.date
                );
            }
            
            // 打刻データを削除
            await api.deleteAttendance(app.todayAttendance.id);
            app.todayAttendance = null;
            this.updateTodayStatus();
            this.updateButtons();
            await this.updateMonthlyOvertime();
            utils.showToast('打刻データをリセットしました', 'success');
        } catch (error) {
            console.error('リセットエラー:', error);
            utils.showToast('リセットに失敗しました', 'error');
        }
    }
};

// 勤怠一覧
const attendance = {
    async loadAttendance() {
        app.allEmployees = await api.getEmployees(); // 従業員データを取得
        app.allAttendance = await api.getAttendance();
        app.compensatoryLeaves = await api.getCompensatoryLeaves();

        // 新規追加ボタンを表示（全ユーザー）
        document.getElementById('addAttendanceBtn').classList.remove('hidden');

        // 月フィルターを当月にセット
        const monthInput = document.getElementById('monthFilter');
        const currentMonth = new Date().toISOString().substring(0, 7);
        if (monthInput) monthInput.value = currentMonth;

        // 管理者の場合は従業員フィルターも表示＆従業員リストを生成
        const nameHeader = document.getElementById('attendanceNameHeader');
        if (app.currentUser.role === 'admin') {
            document.getElementById('employeeFilter').classList.remove('hidden');
            if (nameHeader) nameHeader.style.display = '';
            this.populateEmployeeFilter();
        } else {
            if (nameHeader) nameHeader.style.display = 'none';
        }

        // デフォルトで当月のデータを表示
        this.filterByMonth();
        await clock.updateMonthlyOvertime(true);
    },

    populateEmployeeFilter() {
        const select = document.getElementById('employeeFilter');
        const options = app.allEmployees.map(emp =>
            `<option value="${emp.id}">${emp.name}</option>`
        ).join('');
        select.innerHTML = options;

        // デフォルトで先頭の従業員を選択
        if (app.allEmployees.length > 0) {
            select.value = app.allEmployees[0].id;
        }
    },
    
    renderTable() {
        const tbody = document.getElementById('attendanceTableBody');
        const cardList = document.getElementById('attendanceCardList');
        const noDataMsg = document.getElementById('noDataMessage');

        if (app.filteredAttendance.length === 0) {
            tbody.innerHTML = '';
            if (cardList) cardList.innerHTML = '';
            noDataMsg.classList.remove('hidden');
            return;
        }

        noDataMsg.classList.add('hidden');

        const tableHtml = app.filteredAttendance.map(att => {
            // employee_idから従業員名を取得
            const employee = app.allEmployees.find(e => e.id === att.employee_id);
            const employeeName = employee ? employee.name : '不明';
            let compensatoryInfo = '-';
            if (['休日出勤', '休日出張'].includes(att.shift_type) && att.work_hours > 0) {
                const comp = utils.calculateCompensatory(att.work_hours);
                if (comp.days > 0) {
                    compensatoryInfo = `${comp.days}日`;
                } else {
                    compensatoryInfo = `${comp.hours}時間`;
                }
            }

            // 日付を短縮表示（モバイル対応）
            const shortDate = att.date.split('-').slice(1).join('/'); // MM/DD形式
            const formattedDate = utils.formatDate(att.date);

            const shiftBadgeClass =
                att.shift_type === '早番' ? 'bg-yellow-100 text-yellow-800' :
                att.shift_type === '遅番' ? 'bg-blue-100 text-blue-800' :
                att.shift_type === '出張' ? 'bg-purple-100 text-purple-800' :
                att.shift_type === '休日出張' ? 'bg-purple-50 text-purple-900 border border-purple-200' :
                'bg-red-100 text-red-800';

            // 名前列は管理者のみ表示
            const nameColumn = app.currentUser.role === 'admin'
                ? `<td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium">${employeeName}</td>`
                : '';

            return `
            <tr class="hover:bg-gray-50">
                <td class="px-2 md:px-4 py-2 md:py-3 text-sm sticky-col-left" style="position: sticky; left: 0; z-index: 5; background-color: white;">
                    <div class="flex gap-1">
                        <button onclick="attendance.editAttendance('${att.id}')" class="flex items-center gap-1 text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg bg-blue-50" title="編集">
                            <i class="fas fa-edit text-sm md:text-base"></i><span class="hidden md:inline text-xs">編集</span>
                        </button>
                        <button onclick="attendance.toggleDetail('${att.id}')" class="md:hidden text-gray-600 hover:text-gray-800 p-1" title="詳細表示">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </div>
                </td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                    <span class="hidden md:inline">${utils.formatDate(att.date)}</span>
                    <span class="md:hidden">${shortDate}</span>
                </td>
                ${nameColumn}
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                    <span class="px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs font-medium ${
                        att.shift_type === '早番' ? 'bg-yellow-100 text-yellow-800' :
                        att.shift_type === '遅番' ? 'bg-blue-100 text-blue-800' :
                        att.shift_type === '出張' ? 'bg-purple-100 text-purple-800' :
                        att.shift_type === '休日出張' ? 'bg-purple-50 text-purple-900 border border-purple-200' :
                        'bg-red-100 text-red-800'
                    }">
                        ${att.shift_type}
                    </span>
                </td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-green-600 font-medium">${utils.formatTime(att.clock_in)}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-red-600 font-medium">${utils.formatTime(att.clock_out)}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm hidden md:table-cell">${att.break_minutes}分</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-bold hidden md:table-cell">${att.work_hours}時間</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-bold ${att.overtime_hours > 0 ? 'text-orange-600' : 'text-gray-400'}">${att.overtime_hours || 0}時間</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium text-red-600 hidden md:table-cell">${compensatoryInfo}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-600 hidden md:table-cell">${att.note || '-'}</td>
            </tr>
            <tr id="att-detail-${att.id}" class="md:hidden bg-gray-50 hidden">
                <td colspan="10" class="px-4 py-3 text-xs text-gray-700">
                    <div class="flex flex-wrap gap-3">
                        <span class="px-2 py-1 rounded bg-white shadow-sm">休憩 ${att.break_minutes}分</span>
                        <span class="px-2 py-1 rounded bg-white shadow-sm">勤務 ${att.work_hours}時間</span>
                        <span class="px-2 py-1 rounded bg-white shadow-sm">残業 ${att.overtime_hours || 0}時間</span>
                        <span class="px-2 py-1 rounded bg-white shadow-sm">振替 ${compensatoryInfo}</span>
                    </div>
                    <p class="mt-2 text-gray-600">備考: ${att.note || 'なし'}</p>
                </td>
            </tr>
        `}).join('');

        tbody.innerHTML = tableHtml;

        if (cardList) {
            const cardHtml = app.filteredAttendance.map(att => {
                const employee = app.allEmployees.find(e => e.id === att.employee_id);
                const employeeName = employee ? employee.name : '不明';
                let compensatoryInfo = '-';
                if (['休日出勤', '休日出張'].includes(att.shift_type) && att.work_hours > 0) {
                    const comp = utils.calculateCompensatory(att.work_hours);
                    compensatoryInfo = comp.days > 0 ? `${comp.days}日` : `${comp.hours}時間`;
                }

                const shiftBadgeClass =
                    att.shift_type === '早番' ? 'bg-yellow-100 text-yellow-800' :
                    att.shift_type === '遅番' ? 'bg-blue-100 text-blue-800' :
                    att.shift_type === '出張' ? 'bg-purple-100 text-purple-800' :
                    att.shift_type === '休日出張' ? 'bg-purple-50 text-purple-900 border border-purple-200' :
                    'bg-red-100 text-red-800';

                return `
                <div class="attendance-card bg-white rounded-xl border border-gray-200 p-3">
                    <div class="attendance-card-header flex justify-between items-start">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                <span>${utils.formatDate(att.date)}</span>
                                <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${shiftBadgeClass}">${att.shift_type}</span>
                            </div>
                            ${app.currentUser.role === 'admin' ? `<div class="text-[11px] text-gray-500 mt-1">${employeeName}</div>` : ''}
                            <div class="flex items-center gap-2 mt-2 text-[11px] text-gray-500">
                                <span class="flex items-center gap-1"><i class="far fa-clock"></i>${att.break_minutes}分休憩</span>
                                <span class="flex items-center gap-1"><i class="fas fa-exchange-alt"></i>${compensatoryInfo === '-' ? '振替なし' : `振替 ${compensatoryInfo}`}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-1 ml-3">
                            <button onclick="attendance.editAttendance('${att.id}')" class="px-2 py-1 text-blue-700 hover:text-blue-900 bg-blue-50 rounded-lg text-xs font-semibold" title="編集">
                                <i class="fas fa-edit text-sm"></i><span class="ml-1">編集</span>
                            </button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mt-3">
                        <div class="bg-gray-50 rounded-lg p-2">
                            <div class="attendance-metric-label text-gray-500 flex items-center gap-1"><i class="fas fa-sign-in-alt"></i>出勤</div>
                            <div class="attendance-metric-value font-semibold text-green-700 mt-1">${utils.formatTime(att.clock_in)}</div>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-2">
                            <div class="attendance-metric-label text-gray-500 flex items-center gap-1"><i class="fas fa-sign-out-alt"></i>退勤</div>
                            <div class="attendance-metric-value font-semibold text-red-700 mt-1">${utils.formatTime(att.clock_out)}</div>
                        </div>
                    </div>
                    <div class="mt-2 text-[11px] text-gray-600 flex flex-wrap gap-3">
                        <span class="flex items-center gap-1"><i class="fas fa-briefcase"></i>勤務 ${att.work_hours}時間</span>
                        <span class="flex items-center gap-1 ${att.overtime_hours > 0 ? 'text-orange-600' : 'text-gray-500'}"><i class="fas fa-fire-alt"></i>残業 ${att.overtime_hours || 0}時間</span>
                    </div>
                    <div class="mt-2 text-[11px] text-gray-600">備考: ${att.note || 'なし'}</div>
                </div>
                `;
            }).join('');

            cardList.innerHTML = cardHtml;
        }

        this.updateMonthlySummary();
        this.checkOvertimeAlert();
    },

    toggleDetail(id) {
        const row = document.getElementById(`att-detail-${id}`);
        if (row) {
            row.classList.toggle('hidden');
        }
    },
    
    updateMonthlySummary() {
        const summaryContent = document.getElementById('monthlySummaryContent');
        const summaryTitle = document.getElementById('attendanceSummaryTitle');
        const currentMonth = new Date().toISOString().substring(0, 7);
        const selectedEmployeeId = app.currentUser.role === 'admin'
            ? document.getElementById('employeeFilter')?.value
            : app.currentUser.id;
        
        // 現在表示中のデータから集計
        let totalDays = 0;
        let totalWorkHours = 0;
        let totalOvertimeHours = 0;
        let totalCompensatoryDays = 0;
        let totalCompensatoryHours = 0;
        
        app.filteredAttendance.forEach(att => {
            if (att.clock_out) {
                totalDays++;
                totalWorkHours += att.work_hours || 0;
                totalOvertimeHours += att.overtime_hours || 0;
            }
        });
        
        // 振替休暇の集計（表示中のユーザーのみ）
        const displayedEmployeeIds = [...new Set(app.filteredAttendance.map(att => att.employee_id))];
        app.compensatoryLeaves.forEach(leave => {
            if (!leave.used && displayedEmployeeIds.includes(leave.employee_id)) {
                totalCompensatoryDays += leave.substitute_days || 0;
                totalCompensatoryHours += leave.substitute_hours || 0;
            }
        });

        if (summaryTitle) {
            if (selectedEmployeeId) {
                const employeeName = app.allEmployees.find(e => e.id === selectedEmployeeId)?.name || '従業員';
                summaryTitle.textContent = `${employeeName}さんの今月のサマリー`;
            } else if (displayedEmployeeIds.length === 1) {
                const employeeName = app.allEmployees.find(e => e.id === displayedEmployeeIds[0])?.name || '従業員';
                summaryTitle.textContent = `${employeeName}さんの今月のサマリー`;
            } else {
                summaryTitle.textContent = '今月のサマリー';
            }
        }
        
        const html = `
            <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs text-gray-600 mb-1">出勤日数</div>
                <div class="text-lg md:text-xl font-bold text-blue-600">${totalDays}日</div>
            </div>
            <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs text-gray-600 mb-1">総勤務時間</div>
                <div class="text-lg md:text-xl font-bold text-green-600">${Math.round(totalWorkHours * 10) / 10}h</div>
            </div>
            <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs text-gray-600 mb-1">残業時間</div>
                <div class="text-lg md:text-xl font-bold ${totalOvertimeHours >= 15 ? 'text-orange-600' : 'text-gray-600'}">${Math.round(totalOvertimeHours * 10) / 10}h</div>
            </div>
            <div class="bg-white rounded-lg p-3 shadow-sm">
                <div class="text-xs text-gray-600 mb-1">振替残</div>
                <div class="text-lg md:text-xl font-bold text-red-600">
                    ${totalCompensatoryDays > 0 ? totalCompensatoryDays + '日' : ''}${totalCompensatoryDays > 0 && totalCompensatoryHours > 0 ? '+' : ''}${totalCompensatoryHours > 0 ? totalCompensatoryHours + 'h' : ''}${totalCompensatoryDays === 0 && totalCompensatoryHours === 0 ? '0' : ''}
                </div>
            </div>
        `;
        
        summaryContent.innerHTML = html;
    },
    
    checkOvertimeAlert() {
        const alertDiv = document.getElementById('overtimeAlert');
        const alertContent = document.getElementById('overtimeAlertContent');
        
        // 管理者のみアラートを表示
        if (app.currentUser.role !== 'admin') {
            alertDiv.classList.add('hidden');
            return;
        }
        
        const currentMonth = new Date().toISOString().substring(0, 7);
        
        // 従業員ごとの残業時間を集計
        const employeeOvertime = {};
        
        app.allAttendance.forEach(att => {
            if (att.date.startsWith(currentMonth) && att.clock_out) {
                if (!employeeOvertime[att.employee_id]) {
                    employeeOvertime[att.employee_id] = {
                        name: app.allEmployees.find(e => e.id === att.employee_id)?.name || '不明',
                        hours: 0
                    };
                }
                employeeOvertime[att.employee_id].hours += att.overtime_hours || 0;
            }
        });
        
        // 15時間超過している従業員をフィルター
        const overEmployees = Object.values(employeeOvertime).filter(emp => emp.hours >= 15);
        
        if (overEmployees.length > 0) {
            const html = overEmployees.map(emp => 
                `<div class="mb-1">・<strong>${emp.name}</strong>さん: ${Math.round(emp.hours * 10) / 10}時間</div>`
            ).join('');
            alertContent.innerHTML = `以下の従業員の残業時間が15時間を超えています：<br>${html}`;
            alertDiv.classList.remove('hidden');
        } else {
            alertDiv.classList.add('hidden');
        }
    },
    
    filterByMonth() {
        const monthInput = document.getElementById('monthFilter');
        const employeeSelect = document.getElementById('employeeFilter');
        const targetMonth = monthInput.value;
        const selectedEmployeeId = employeeSelect.value || (employeeSelect.options[0]?.value || '');
        
        // まず全データから開始
        let filtered = [...app.allAttendance];
        
        // 一般ユーザーの場合は自分のデータのみ
        if (app.currentUser.role !== 'admin') {
            filtered = filtered.filter(att => att.employee_id === app.currentUser.id);
        }

        // 管理者は必ず選択した従業員で絞り込み
        if (app.currentUser.role === 'admin') {
            filtered = filtered.filter(att => att.employee_id === selectedEmployeeId);
        }
        
        // 月でフィルタリング
        if (targetMonth) {
            filtered = filtered.filter(att => att.date.startsWith(targetMonth));
        }

        app.filteredAttendance = filtered;
        const monthLabel = targetMonth ? `${targetMonth.split('-')[0]}年${targetMonth.split('-')[1]}月` : '全期間';
        const employeeLabel = app.currentUser.role === 'admin'
            ? (app.allEmployees.find(e => e.id === selectedEmployeeId)?.name || '選択中の従業員')
            : '自分のみ';
        const summary = document.getElementById('attendanceFilterSummary');
        if (summary) {
            summary.querySelector('span').textContent = `${employeeLabel} / ${monthLabel} を表示中`;
        }
        this.renderTable();
    },
    
    editAttendance(id) {
        const att = app.allAttendance.find(a => a.id === id);
        if (!att) return;
        
        const employee = app.allEmployees.find(e => e.id === att.employee_id);
        const employeeName = employee ? employee.name : '不明';
        
        document.getElementById('editAttendanceId').value = att.id;
        document.getElementById('editDate').value = att.date;
        document.getElementById('editEmployeeName').value = employeeName;
        document.getElementById('editShiftType').value = att.shift_type;
        document.getElementById('editClockIn').value = utils.formatTime(att.clock_in);
        document.getElementById('editClockOut').value = utils.formatTime(att.clock_out);
        document.getElementById('editNote').value = att.note || '';
        
        document.getElementById('attendanceModal').classList.remove('hidden');
    },
    
    async saveAttendance(event) {
        event.preventDefault();
        
        const id = document.getElementById('editAttendanceId').value;
        const date = document.getElementById('editDate').value;
        const clockInTime = document.getElementById('editClockIn').value;
        const clockOutTime = document.getElementById('editClockOut').value;
        
        // HH:MM形式をタイムスタンプに変換
        const clockInTimestamp = utils.createTimestamp(date, clockInTime);
        const clockOutTimestamp = utils.createTimestamp(date, clockOutTime);
        
        // タイムスタンプから勤務時間を計算
        let workHours = 0;
        let breakMinutes = 0;
        
        if (clockInTimestamp && clockOutTimestamp) {
            const clockInDate = new Date(clockInTimestamp);
            const clockOutDate = new Date(clockOutTimestamp);
            const diffMinutes = (clockOutDate - clockInDate) / 1000 / 60;
            const diffHours = diffMinutes / 60;
            
            // 休憩時間を自動控除
            if (diffHours >= 8) {
                breakMinutes = 60;
            } else if (diffHours >= 6) {
                breakMinutes = 45;
            }
            
            const actualWorkMinutes = diffMinutes - breakMinutes;
            workHours = Math.round((actualWorkMinutes / 60) * 10) / 10;
        }
        
        // 残業時間を計算（8時間を超えた分）
        const overtimeHours = workHours > 8 ? Math.round((workHours - 8) * 10) / 10 : 0;
        
        const data = {
            shift_type: document.getElementById('editShiftType').value,
            clock_in: clockInTimestamp,
            clock_out: clockOutTimestamp,
            break_minutes: breakMinutes,
            work_hours: workHours,
            overtime_hours: overtimeHours,
            note: document.getElementById('editNote').value
        };
        
        try {
            await api.updateAttendance(id, data);
            utils.showToast('勤怠情報を更新しました', 'success');
            document.getElementById('attendanceModal').classList.add('hidden');
            await this.loadAttendance();
        } catch (error) {
            console.error('勤怠更新エラー:', error);
            utils.showToast('更新に失敗しました', 'error');
        }
    },
    
    // 新規追加モーダルを表示
    showAddModal() {
        // 従業員セレクトボックスを生成
        const selectElement = document.getElementById('addEmployeeId');
        
        if (app.currentUser.role === 'admin') {
            // 管理者：全従業員を選択可能
            const options = app.allEmployees.map(emp => 
                `<option value="${emp.id}">${emp.name}</option>`
            ).join('');
            selectElement.innerHTML = '<option value="">選択してください</option>' + options;
            selectElement.disabled = false;
        } else {
            // 一般ユーザー：自分のみ選択（固定）
            selectElement.innerHTML = `<option value="${app.currentUser.id}">${app.currentUser.name}</option>`;
            selectElement.disabled = true;
        }
        
        // フォームをリセット
        document.getElementById('addAttendanceForm').reset();
        
        // デフォルト値を設定
        document.getElementById('addDate').value = utils.getCurrentDate();
        
        // 一般ユーザーの場合は自分のIDを自動選択
        if (app.currentUser.role !== 'admin') {
            selectElement.value = app.currentUser.id;
        }
        
        // モーダルを表示
        document.getElementById('addAttendanceModal').classList.remove('hidden');
    },
    
    // 新規追加モーダルを非表示
    hideAddModal() {
        document.getElementById('addAttendanceModal').classList.add('hidden');
    },
    
    // 新規勤怠データを保存
    async saveNewAttendance(event) {
        event.preventDefault();
        
        const date = document.getElementById('addDate').value;
        const employeeId = document.getElementById('addEmployeeId').value;
        const shiftType = document.getElementById('addShiftType').value;
        const clockInTime = document.getElementById('addClockIn').value;
        const clockOutTime = document.getElementById('addClockOut').value;
        const note = document.getElementById('addNote').value;
        
        if (!employeeId) {
            utils.showToast('従業員を選択してください', 'error');
            return;
        }
        
        // HH:MM形式をタイムスタンプに変換
        const clockInTimestamp = utils.createTimestamp(date, clockInTime);
        const clockOutTimestamp = utils.createTimestamp(date, clockOutTime);
        
        // タイムスタンプから勤務時間を計算
        let workHours = 0;
        let breakMinutes = 0;
        let overtimeHours = 0;
        
        if (clockInTimestamp && clockOutTimestamp) {
            const clockInDate = new Date(clockInTimestamp);
            const clockOutDate = new Date(clockOutTimestamp);
            const diffMinutes = (clockOutDate - clockInDate) / 1000 / 60;
            const diffHours = diffMinutes / 60;
            
            // 休憩時間を自動控除
            if (diffHours >= 8) {
                breakMinutes = 60;
            } else if (diffHours >= 6) {
                breakMinutes = 45;
            }
            
            const actualWorkMinutes = diffMinutes - breakMinutes;
            workHours = Math.round((actualWorkMinutes / 60) * 10) / 10;
            
            // 残業時間を計算（8時間を超えた分）
            overtimeHours = workHours > 8 ? Math.round((workHours - 8) * 10) / 10 : 0;
        }
        
        const data = {
            employee_id: employeeId,
            date: date,
            shift_type: shiftType,
            clock_in: clockInTimestamp,
            clock_out: clockOutTimestamp,
            break_minutes: breakMinutes,
            work_hours: workHours,
            overtime_hours: overtimeHours,
            note: note,
            status: 'completed'
        };
        
        try {
            // 勤怠データを追加
            await api.createAttendance(data);
            
            // 休日出勤の場合、振替休暇を自動計算して追加（休日出張含む）
            if (['休日出勤', '休日出張'].includes(shiftType) && workHours > 0) {
                const compensatory = utils.calculateCompensatory(workHours);
                const compensatoryData = {
                    employee_id: employeeId,
                    work_date: date,
                    work_hours: workHours,
                    substitute_days: compensatory.days,
                    substitute_hours: compensatory.hours,
                    used: false,
                    used_date: null
                };
                await api.createCompensatoryLeave(compensatoryData);
            }
            
            utils.showToast('勤怠データを追加しました', 'success');
            this.hideAddModal();
            await this.loadAttendance();
        } catch (error) {
            console.error('勤怠追加エラー:', error);
            utils.showToast('追加に失敗しました', 'error');
        }
    },
    
    async deleteAttendance(id, options = {}) {
        const { skipConfirm = false } = options;

        if (!skipConfirm && !confirm('この勤怠データを削除しますか？\nこの操作は取り消せません。')) return;
        
        try {
            // 削除対象の勤怠データを取得
            const att = app.allAttendance.find(a => a.id === id);
            if (!att) {
                utils.showToast('勤怠データが見つかりません', 'error');
                return;
            }
            
            // 休日出勤の場合、対応する振替休暇も削除（休日出張含む）
            if (['休日出勤', '休日出張'].includes(att.shift_type)) {
                await api.deleteCompensatoryLeaveByWorkDate(att.employee_id, att.date);
            }
            
            // 勤怠データを削除
            await api.deleteAttendance(id);
            utils.showToast('勤怠データを削除しました', 'success');
            await this.loadAttendance();
        } catch (error) {
            console.error('勤怠削除エラー:', error);
            utils.showToast('削除に失敗しました', 'error');
        }
    },

    async deleteAttendanceFromModal() {
        const id = document.getElementById('editAttendanceId').value;
        if (!id) return;

        if (!confirm('この勤怠データを削除しますか？\nこの操作は取り消せません。')) return;

        document.getElementById('attendanceModal').classList.add('hidden');
        await this.deleteAttendance(id, { skipConfirm: true });
    }
};

// ダッシュボード管理
const dashboard = {
    async loadDashboard() {
        app.allEmployees = await api.getEmployees();
        app.allAttendance = await api.getAttendance();
        app.compensatoryLeaves = await api.getCompensatoryLeaves();
        
        this.populateEmployeeFilter();
        
        // デフォルトで当月と現在のユーザーを設定
        const currentMonth = new Date().toISOString().substring(0, 7);
        document.getElementById('dashboardMonthFilter').value = currentMonth;
        
        this.updateDashboard();
    },
    
    populateEmployeeFilter() {
        const select = document.getElementById('dashboardEmployeeFilter');
        
        if (app.currentUser.role === 'admin') {
            // 管理者：全員選択可能
            const options = app.allEmployees.map(emp => 
                `<option value="${emp.id}">${emp.name}</option>`
            ).join('');
            select.innerHTML = options;
        } else {
            // 一般ユーザー：自分のみ
            select.innerHTML = `<option value="${app.currentUser.id}">${app.currentUser.name}</option>`;
            select.disabled = true;
        }
    },
    
    updateDashboard() {
        const selectedEmployeeId = document.getElementById('dashboardEmployeeFilter').value;
        const selectedMonth = document.getElementById('dashboardMonthFilter').value;
        
        if (!selectedEmployeeId || !selectedMonth) return;
        
        const employee = app.allEmployees.find(e => e.id === selectedEmployeeId);
        const employeeName = employee ? employee.name : '不明';
        
        // タイトル更新
        document.getElementById('dashboardEmployeeName').textContent = `${employeeName}さんの今月のサマリー`;
        
        // 対象月のデータをフィルタリング
        const filteredAttendance = app.allAttendance.filter(att => 
            att.employee_id === selectedEmployeeId && att.date.startsWith(selectedMonth)
        );
        
        // サマリー計算
        let totalDays = 0;
        let totalWorkHours = 0;
        let totalOvertimeHours = 0;
        
        filteredAttendance.forEach(att => {
            if (att.clock_out) {
                totalDays++;
                totalWorkHours += att.work_hours || 0;
                totalOvertimeHours += att.overtime_hours || 0;
            }
        });
        
        // 振替休暇の集計
        let totalCompensatoryDays = 0;
        let totalCompensatoryHours = 0;
        
        app.compensatoryLeaves.forEach(leave => {
            if (!leave.used && leave.employee_id === selectedEmployeeId) {
                totalCompensatoryDays += leave.substitute_days || 0;
                totalCompensatoryHours += leave.substitute_hours || 0;
            }
        });
        
        // サマリー表示
        const summaryHtml = `
            <div class="bg-white rounded-xl p-4 shadow-md border-l-4 border-blue-500">
                <div class="text-xs text-gray-600 mb-2">出勤日数</div>
                <div class="text-2xl md:text-3xl font-bold text-blue-600">${totalDays}<span class="text-sm">日</span></div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-md border-l-4 border-green-500">
                <div class="text-xs text-gray-600 mb-2">総勤務時間</div>
                <div class="text-2xl md:text-3xl font-bold text-green-600">${Math.round(totalWorkHours * 10) / 10}<span class="text-sm">h</span></div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-md border-l-4 ${totalOvertimeHours >= 15 ? 'border-orange-500' : 'border-gray-400'}">
                <div class="text-xs text-gray-600 mb-2">残業時間</div>
                <div class="text-2xl md:text-3xl font-bold ${totalOvertimeHours >= 15 ? 'text-orange-600' : 'text-gray-600'}">${Math.round(totalOvertimeHours * 10) / 10}<span class="text-sm">h</span></div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-md border-l-4 border-red-500">
                <div class="text-xs text-gray-600 mb-2">振替残</div>
                <div class="text-2xl md:text-3xl font-bold text-red-600">
                    ${totalCompensatoryDays > 0 ? totalCompensatoryDays + '<span class="text-sm">日</span>' : ''}${totalCompensatoryDays > 0 && totalCompensatoryHours > 0 ? '+' : ''}${totalCompensatoryHours > 0 ? totalCompensatoryHours + '<span class="text-sm">h</span>' : ''}${totalCompensatoryDays === 0 && totalCompensatoryHours === 0 ? '0' : ''}
                </div>
            </div>
        `;
        
        document.getElementById('dashboardSummaryContent').innerHTML = summaryHtml;
        
        // 残業時間アラート
        this.checkOvertimeAlert(totalOvertimeHours, employeeName);
    },
    
    checkOvertimeAlert(overtimeHours, employeeName) {
        const alertDiv = document.getElementById('dashboardOvertimeAlert');
        const alertContent = document.getElementById('dashboardOvertimeAlertContent');
        
        if (overtimeHours >= 15) {
            alertContent.innerHTML = `${employeeName}さんの今月の残業時間が<strong>${Math.round(overtimeHours * 10) / 10}時間</strong>に達しています。健康管理にご注意ください。`;
            alertDiv.classList.remove('hidden');
        } else {
            alertDiv.classList.add('hidden');
        }
    }
};

// 振替休暇管理
const compensatory = {
    showUseModal(employeeId) {
        const leaves = app.compensatoryLeaves.filter(
            l => l.employee_id === employeeId && !l.used
        );
        
        if (leaves.length === 0) {
            utils.showToast('利用可能な振替休暇がありません', 'info');
            return;
        }
        
        const employee = app.allEmployees.find(e => e.id === employeeId)?.name || '不明';
        let totalDays = 0;
        let totalHours = 0;
        
        leaves.forEach(l => {
            totalDays += l.substitute_days;
            totalHours += l.substitute_hours;
        });
        
        const message = `${employee}さんの振替休暇を使用しますか？\n\n利用可能: ${totalDays > 0 ? totalDays + '日' : ''}${totalDays > 0 && totalHours > 0 ? ' + ' : ''}${totalHours > 0 ? totalHours + '時間' : ''}\n\n※ 最も古い振替から順に消化されます`;
        
        if (confirm(message)) {
            this.useCompensatory(employeeId);
        }
    },
    
    async useCompensatory(employeeId) {
        const leaves = app.compensatoryLeaves.filter(
            l => l.employee_id === employeeId && !l.used
        ).sort((a, b) => a.work_date.localeCompare(b.work_date));
        
        if (leaves.length === 0) return;
        
        // 最も古い振替を1つ消化
        const leave = leaves[0];
        const today = utils.getCurrentDate();
        
        try {
            await api.updateCompensatoryLeave(leave.id, {
                used: true,
                used_date: today
            });
            
            utils.showToast('振替休暇を使用しました', 'success');
            await attendance.loadAttendance();
        } catch (error) {
            utils.showToast('振替休暇の使用に失敗しました', 'error');
        }
    }
};

// 振替休暇管理（新規タブ用）
const compensatoryManagement = {
    async loadCompensatory() {
        app.allEmployees = await api.getEmployees();
        app.allAttendance = await api.getAttendance();
        app.compensatoryLeaves = await api.getCompensatoryLeaves();
        
        // 一般ユーザーの場合は自分のデータのみにフィルタリング
        if (app.currentUser.role !== 'admin') {
            app.compensatoryLeaves = app.compensatoryLeaves.filter(
                leave => leave.employee_id === app.currentUser.id
            );
        }
        
        // 管理者の場合、従業員フィルターを表示
        const filterContainer = document.getElementById('compensatoryFilterContainer');
        const nameHeader = document.getElementById('compensatoryNameHeader');
        const employeeFilterWrapper = document.getElementById('compensatoryEmployeeFilterWrapper');
        const statusFilter = document.getElementById('compensatoryStatusFilter');

        if (statusFilter) {
            statusFilter.value = app.currentUser.role === 'admin' ? 'all' : 'unused';
        }

        if (app.currentUser.role === 'admin') {
            if (filterContainer) filterContainer.classList.remove('hidden');
            if (employeeFilterWrapper) employeeFilterWrapper.classList.remove('hidden');
            if (nameHeader) nameHeader.style.display = '';
            this.renderEmployeeFilter();
        } else {
            if (filterContainer) filterContainer.classList.remove('hidden');
            if (employeeFilterWrapper) employeeFilterWrapper.classList.add('hidden');
            if (nameHeader) nameHeader.style.display = 'none';
        }

        const selectedStatus = statusFilter ? statusFilter.value : 'all';
        this.renderTable(null, selectedStatus);
    },
    
    renderEmployeeFilter() {
        const filterSelect = document.getElementById('compensatoryEmployeeFilter');
        const activeEmployees = app.allEmployees.filter(e => e.status === 'active');
        
        const options = activeEmployees.map(emp => 
            `<option value="${emp.id}">${emp.name}</option>`
        ).join('');
        
        filterSelect.innerHTML = '<option value="">全員</option>' + options;
    },
    
    filterCompensatory() {
        const selectedEmployeeId = document.getElementById('compensatoryEmployeeFilter').value;
        const selectedStatus = document.getElementById('compensatoryStatusFilter').value;

        this.renderTable(selectedEmployeeId || null, selectedStatus || 'all');
    },

    renderTable(filterEmployeeId = null, statusFilter = 'all') {
        const tbody = document.getElementById('compensatoryTableBody');
        const cardList = document.getElementById('compensatoryCardList');
        const noDataMsg = document.getElementById('noCompensatoryMessage');

        // フィルタリング
        let leavesToDisplay = app.compensatoryLeaves;
        if (filterEmployeeId) {
            leavesToDisplay = app.compensatoryLeaves.filter(
                leave => leave.employee_id === filterEmployeeId
            );
        }

        if (statusFilter === 'unused') {
            leavesToDisplay = leavesToDisplay.filter(leave => !leave.used);
        } else if (statusFilter === 'used') {
            leavesToDisplay = leavesToDisplay.filter(leave => leave.used);
        }
        
        if (leavesToDisplay.length === 0) {
            tbody.innerHTML = '';
            if (cardList) cardList.innerHTML = '';
            noDataMsg.classList.remove('hidden');
            return;
        }

        noDataMsg.classList.add('hidden');
        
        const html = leavesToDisplay.map(leave => {
            const employee = app.allEmployees.find(e => e.id === leave.employee_id);
            const employeeName = employee ? employee.name : '不明';
            const isAdmin = app.currentUser.role === 'admin';

            // 対応する勤怠データから出退勤時刻を取得
            const attendance = app.allAttendance.find(att =>
                att.employee_id === leave.employee_id &&
                att.date === leave.work_date &&
                ['休日出勤', '休日出張'].includes(att.shift_type)
            );
            
            const clockIn = attendance ? utils.formatTime(attendance.clock_in) : '-';
            const clockOut = attendance ? utils.formatTime(attendance.clock_out) : '-';
            
            let substituteInfo = '';
            if (leave.substitute_days > 0) {
                substituteInfo = `${leave.substitute_days}日`;
            } else {
                substituteInfo = `${leave.substitute_hours}時間`;
            }
            
            const statusBadge = leave.used 
                ? '<span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">使用済</span>'
                : '<span class="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">未使用</span>';
            
            // 名前列は管理者のみ表示
            const nameColumn = app.currentUser.role === 'admin'
                ? `<td class="px-3 py-3 text-xs font-medium whitespace-nowrap">${employeeName}</td>`
                : '';

            const actionContent = isAdmin
                ? '<span class="text-[11px] text-gray-500">閲覧のみ</span>'
                : `<div class="flex gap-0.5 justify-center">
                        <button onclick="compensatoryManagement.toggleUsed('${leave.id}', ${!leave.used})"
                                class="px-2 py-1 rounded text-xs font-bold transition ${
                                    leave.used
                                        ? 'bg-green-500 hover:bg-green-600 text-white'
                                        : 'bg-gray-500 hover:bg-gray-600 text-white'
                                }"
                                title="${leave.used ? '未使用に戻す' : '使用済にする'}">
                            ${leave.used ? '未' : '済'}
                        </button>
                        ${leave.used ? `
                        <button onclick="compensatoryManagement.saveUsedDate('${leave.id}')"
                                class="px-1.5 py-1 rounded text-xs font-medium transition bg-blue-500 hover:bg-blue-600 text-white"
                                title="使用日を保存">
                            <i class="fas fa-save text-xs"></i>
                        </button>
                        ` : ''}
                    </div>`;

            return `
            <tr class="hover:bg-gray-50">
                <td class="px-2 py-2 text-xs sticky-col-left" style="position: sticky; left: 0; z-index: 5; background-color: white; min-width: 50px;">
                    ${actionContent}
                </td>
                ${nameColumn}
                <td class="px-3 py-3 text-xs whitespace-nowrap">${utils.formatDate(leave.work_date)}</td>
                <td class="px-3 py-3 text-xs text-green-600 font-medium whitespace-nowrap">${clockIn}</td>
                <td class="px-3 py-3 text-xs text-red-600 font-medium whitespace-nowrap">${clockOut}</td>
                <td class="px-3 py-3 text-xs font-bold whitespace-nowrap">${leave.work_hours}時間</td>
                <td class="px-3 py-3 text-xs font-medium text-red-600 whitespace-nowrap">${substituteInfo}</td>
                <td class="px-3 py-3 text-xs">
                    <input type="date"
                           id="usedDate_${leave.id}"
                           value="${leave.used_date || ''}"
                           class="px-2 py-1 border border-gray-300 rounded text-xs w-32"
                           ${(!leave.used || isAdmin) ? 'disabled' : ''}>
                </td>
                <td class="px-3 py-3 text-xs whitespace-nowrap">${statusBadge}</td>
            </tr>
        `}).join('');
        
        tbody.innerHTML = html;

        if (cardList) {
            const cardHtml = leavesToDisplay.map(leave => {
                const employee = app.allEmployees.find(e => e.id === leave.employee_id);
                const employeeName = employee ? employee.name : '不明';
                const isAdmin = app.currentUser.role === 'admin';

                const attendance = app.allAttendance.find(att =>
                    att.employee_id === leave.employee_id &&
                    att.date === leave.work_date &&
                    ['休日出勤', '休日出張'].includes(att.shift_type)
                );

                const clockIn = attendance ? utils.formatTime(attendance.clock_in) : '-';
                const clockOut = attendance ? utils.formatTime(attendance.clock_out) : '-';

                const substituteInfo = leave.substitute_days > 0
                    ? `${leave.substitute_days}日`
                    : `${leave.substitute_hours}時間`;

                const statusBadge = leave.used
                    ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-800">使用済</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">未使用</span>';

                return `
                <div class="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-2">
                    <div class="flex items-start gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                <span>${utils.formatDate(leave.work_date)}</span>
                                ${statusBadge}
                            </div>
                            ${app.currentUser.role === 'admin' ? `<div class="text-[11px] text-gray-500 mt-1">${employeeName}</div>` : ''}
                            <div class="mt-2 text-[11px] text-gray-600 flex flex-wrap gap-2">
                                <span class="flex items-center gap-1"><i class="far fa-clock"></i>${clockIn} - ${clockOut}</span>
                                <span class="flex items-center gap-1"><i class="fas fa-briefcase"></i>${leave.work_hours}時間</span>
                                <span class="flex items-center gap-1 text-red-600"><i class="fas fa-exchange-alt"></i>${substituteInfo}</span>
                            </div>
                        </div>
                        ${isAdmin ? '<span class="text-[11px] text-gray-500">閲覧のみ</span>' : `
                        <button onclick="compensatoryManagement.toggleUsed('${leave.id}', ${!leave.used})"
                                class="px-2 py-1 text-xs font-semibold rounded-lg ${leave.used ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-green-600 text-white hover:bg-green-700'}" title="状態切替">
                            ${leave.used ? '未使用に戻す' : '使用済にする'}
                        </button>
                        `}
                    </div>
                    <div class="flex flex-col gap-2">
                        ${leave.used && !isAdmin ? `
                        <div class="flex items-center gap-2">
                            <input type="date"
                                   id="usedDate_${leave.id}"
                                   value="${leave.used_date || ''}"
                                   class="flex-1 px-2 py-2 border border-gray-300 rounded text-xs">
                            <button onclick="compensatoryManagement.saveUsedDate('${leave.id}')"
                                    class="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
                                <i class="fas fa-save"></i><span>保存</span>
                            </button>
                        </div>
                        ` : `<div class="text-[11px] text-gray-500">${isAdmin ? '操作権限がありません。' : '使用日を入力するには「使用済」に変更してください。'}</div>`}
                    </div>
                </div>
                `;
            }).join('');

            cardList.innerHTML = cardHtml;
        }
    },

    async toggleUsed(leaveId, newUsedStatus) {
        if (app.currentUser.role === 'admin') {
            utils.showToast('管理者は操作できません', 'info');
            return;
        }
        try {
            const leave = app.compensatoryLeaves.find(l => l.id === leaveId);
            if (!leave) return;
            
            // 使用済にする場合はモーダルで日付を選択
            if (newUsedStatus) {
                this.showUsedDateModal(leaveId);
            } else {
                // 未使用に戻す場合は確認後に処理
                if (!confirm('振替休暇を未使用に戻しますか？')) return;
                
                const data = {
                    used: false,
                    used_date: null
                };
                
                await api.updateCompensatoryLeave(leaveId, data);
                utils.showToast('未使用に戻しました', 'success');
                await this.loadCompensatory();
            }
        } catch (error) {
            console.error('振替休暇更新エラー:', error);
            utils.showToast('更新に失敗しました', 'error');
        }
    },
    
    showUsedDateModal(leaveId) {
        const leave = app.compensatoryLeaves.find(l => l.id === leaveId);
        if (!leave) return;
        
        const employee = app.allEmployees.find(e => e.id === leave.employee_id);
        const employeeName = employee ? employee.name : '不明';
        
        document.getElementById('selectedLeaveId').value = leaveId;
        document.getElementById('usedDateEmployeeName').textContent = `${employeeName}さんの振替休暇を使用済にします。`;
        document.getElementById('selectedUsedDate').value = utils.getCurrentDate();
        document.getElementById('usedDateModal').classList.remove('hidden');
    },
    
    hideUsedDateModal() {
        document.getElementById('usedDateModal').classList.add('hidden');
    },

    async submitUsedDate(event) {
        event.preventDefault();

        if (app.currentUser.role === 'admin') {
            utils.showToast('管理者は操作できません', 'info');
            return;
        }

        const leaveId = document.getElementById('selectedLeaveId').value;
        const usedDate = document.getElementById('selectedUsedDate').value;
        
        if (!usedDate) {
            utils.showToast('使用日を選択してください', 'error');
            return;
        }
        
        try {
            const data = {
                used: true,
                used_date: usedDate
            };
            
            await api.updateCompensatoryLeave(leaveId, data);
            utils.showToast('振替休暇を使用済にしました', 'success');
            this.hideUsedDateModal();
            await this.loadCompensatory();
        } catch (error) {
            console.error('振替休暇更新エラー:', error);
            utils.showToast('更新に失敗しました', 'error');
        }
    },
    
    async saveUsedDate(leaveId) {
        if (app.currentUser.role === 'admin') {
            utils.showToast('管理者は操作できません', 'info');
            return;
        }
        try {
            const usedDateInput = document.getElementById(`usedDate_${leaveId}`);
            const usedDate = usedDateInput.value;
            
            if (!usedDate) {
                utils.showToast('使用日を入力してください', 'error');
                return;
            }
            
            const data = {
                used_date: usedDate
            };
            
            await api.updateCompensatoryLeave(leaveId, data);
            utils.showToast('使用日を更新しました', 'success');
            await this.loadCompensatory();
        } catch (error) {
            console.error('使用日更新エラー:', error);
            utils.showToast('更新に失敗しました', 'error');
        }
    }
};

// CSV出力
const exportData = {
    loadEmployeeCheckboxes() {
        const container = document.getElementById('employeeCheckboxList');
        const activeEmployees = app.allEmployees.filter(e => e.status === 'active');
        
        const html = activeEmployees.map(emp => `
            <label class="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                <input type="checkbox" class="employee-checkbox w-4 h-4 text-tsunagu-blue border-gray-300 rounded focus:ring-tsunagu-blue mr-2" 
                       value="${emp.id}" checked>
                <span class="text-sm md:text-base">${emp.name}</span>
            </label>
        `).join('');
        
        container.innerHTML = html;
        
        // 全員選択チェックボックスのイベント
        document.getElementById('selectAllEmployees').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.employee-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
        
        // 個別チェックボックスの変更で全員選択の状態を更新
        container.addEventListener('change', () => {
            const checkboxes = document.querySelectorAll('.employee-checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            document.getElementById('selectAllEmployees').checked = allChecked;
        });
    },
    
    async exportCSV() {
        const startDate = document.getElementById('exportStartDate').value;
        const endDate = document.getElementById('exportEndDate').value;
        
        if (!startDate || !endDate) {
            utils.showToast('開始日と終了日を選択してください', 'error');
            return;
        }
        
        // 選択された従業員IDを取得
        const selectedEmployeeIds = Array.from(document.querySelectorAll('.employee-checkbox:checked'))
            .map(cb => cb.value);
        
        if (selectedEmployeeIds.length === 0) {
            utils.showToast('従業員を1人以上選択してください', 'error');
            return;
        }
        
        const data = await api.getAttendance();
        const filtered = data.filter(att => {
            return att.date >= startDate && 
                   att.date <= endDate && 
                   selectedEmployeeIds.includes(att.employee_id.toString());
        });
        
        if (filtered.length === 0) {
            utils.showToast('指定条件のデータがありません', 'info');
            return;
        }
        
        // CSV生成
        const headers = ['日付', '氏名', 'シフト', '出勤時刻', '退勤時刻', '休憩時間(分)', '勤務時間(時間)', '残業時間(時間)', '振替', '備考'];
        const rows = filtered.map(att => {
            let compInfo = '';
            if (['休日出勤', '休日出張'].includes(att.shift_type) && att.work_hours > 0) {
                const comp = utils.calculateCompensatory(att.work_hours);
                compInfo = comp.days > 0 ? `${comp.days}日` : `${comp.hours}時間`;
            }
            
            return [
                att.date,
                app.allEmployees.find(e => e.id === att.employee_id)?.name || '不明',
                att.shift_type,
                utils.formatTime(att.clock_in),
                utils.formatTime(att.clock_out),
                att.break_minutes,
                att.work_hours,
                att.overtime_hours || 0,
                compInfo,
                att.note || ''
            ];
        });
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        // BOM付きUTF-8でダウンロード
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `勤怠データ_${startDate}_${endDate}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        
        utils.showToast('CSVファイルをダウンロードしました', 'success');
    }
};

// 従業員管理
const employees = {
    async loadEmployees() {
        app.allEmployees = await api.getEmployees();
        this.renderTable();
    },
    
    renderTable() {
        const tbody = document.getElementById('employeesTableBody');
        
        const html = app.allEmployees.map(emp => `
            <tr class="hover:bg-gray-50">
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium">${emp.employee_number}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">${emp.name}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                    <span class="px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs font-medium ${emp.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}">
                        ${emp.role === 'admin' ? '管理者' : '一般'}
                    </span>
                </td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                    <span class="px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs font-medium ${emp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${emp.status === 'active' ? '有効' : '無効'}
                    </span>
                </td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-sm">
                    <button onclick="employees.editEmployee('${emp.id}')" class="text-blue-600 hover:text-blue-800 mr-2 md:mr-3 p-1">
                        <i class="fas fa-edit text-sm md:text-base"></i>
                    </button>
                    <button onclick="employees.deleteEmployee('${emp.id}')" class="text-red-600 hover:text-red-800 p-1">
                        <i class="fas fa-trash text-sm md:text-base"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = html;
    },
    
    showModal(employeeId = null) {
        const modal = document.getElementById('employeeModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('employeeForm');
        
        form.reset();
        document.getElementById('editEmployeeId').value = '';
        
        if (employeeId) {
            const emp = app.allEmployees.find(e => e.id === employeeId);
            title.textContent = '従業員を編集';
            document.getElementById('editEmployeeId').value = emp.id;
            document.getElementById('employeeNumberInput').value = emp.employee_number;
            document.getElementById('employeeNameInput').value = emp.name;
            document.getElementById('employeeRoleInput').value = emp.role;
        } else {
            title.textContent = '従業員を追加';
        }
        
        modal.classList.remove('hidden');
    },
    
    hideModal() {
        document.getElementById('employeeModal').classList.add('hidden');
    },
    
    async saveEmployee(event) {
        event.preventDefault();
        
        const id = document.getElementById('editEmployeeId').value;
        const data = {
            employee_number: document.getElementById('employeeNumberInput').value,
            name: document.getElementById('employeeNameInput').value,
            role: document.getElementById('employeeRoleInput').value,
            status: 'active'
        };
        
        try {
            if (id) {
                await api.updateEmployee(id, data);
                utils.showToast('従業員情報を更新しました', 'success');
                this.hideModal();
                await this.loadEmployees();
            } else {
                await api.createEmployee(data);
                utils.showToast('従業員を追加しました', 'success');
                // 新規追加の場合はページをリロード
                setTimeout(() => {
                    location.reload();
                }, 500);
            }
        } catch (error) {
            console.error('従業員保存エラー:', error);
            // エラーでもリロードして確認
            utils.showToast('保存処理を実行しました。確認のためページをリロードします', 'info');
            setTimeout(() => {
                location.reload();
            }, 1500);
        }
    },
    
    editEmployee(id) {
        this.showModal(id);
    },
    
    async deleteEmployee(id) {
        if (!confirm('この従業員を削除してもよろしいですか？')) return;
        
        try {
            await api.deleteEmployee(id);
            utils.showToast('従業員を削除しました', 'success');
            await this.loadEmployees();
        } catch (error) {
            utils.showToast('削除に失敗しました', 'error');
        }
    }
};

// 有給休暇管理
const paidLeave = {
    sortRequestsByNewest(a, b) {
        const requestDateDiff = new Date(b.request_date) - new Date(a.request_date);
        if (requestDateDiff !== 0) return requestDateDiff;

        if (a.created_at || b.created_at) {
            const createdDiff = new Date(b.created_at || b.request_date) - new Date(a.created_at || a.request_date);
            if (createdDiff !== 0) return createdDiff;
        }

        return (b.leave_date || '').localeCompare(a.leave_date || '');
    },

    async loadPaidLeave() {
        app.allEmployees = await api.getEmployees();
        const paidLeaves = await api.getPaidLeaves();
        const leaveRequests = await api.getLeaveRequests();

        // 一般ユーザーの場合は自分のデータのみにフィルタリング
        if (app.currentUser.role !== 'admin') {
            app.paidLeaves = paidLeaves.filter(pl => pl.employee_id === app.currentUser.id);
            app.leaveRequests = leaveRequests
                .filter(lr => lr.employee_id === app.currentUser.id)
                .sort(this.sortRequestsByNewest);
        } else {
            app.paidLeaves = paidLeaves;
            app.leaveRequests = [...leaveRequests].sort(this.sortRequestsByNewest);
        }

        // 管理者はサマリーカードと申請フォームを非表示
        const summarySection = document.getElementById('paidLeaveSummarySection');
        const requestFormCard = document.getElementById('leaveRequestFormCard');
        if (app.currentUser.role === 'admin') {
            summarySection?.classList.add('hidden');
            requestFormCard?.classList.add('hidden');
        } else {
            summarySection?.classList.remove('hidden');
            requestFormCard?.classList.remove('hidden');
        }

        this.updateSummary();
        this.renderRequests();
    },
    
    updateSummary() {
        // 自分の有給データを集計
        const myLeaves = app.paidLeaves.filter(pl => 
            pl.employee_id === app.currentUser.id && pl.status === 'active'
        );
        
        let totalRemaining = 0;
        let totalGranted = 0;
        let totalUsed = 0;
        
        myLeaves.forEach(pl => {
            totalRemaining += pl.remaining_days || 0;
            totalGranted += pl.grant_days || 0;
            totalUsed += pl.used_days || 0;
        });
        
        document.getElementById('paidLeaveRemaining').textContent = `${totalRemaining}日`;
        document.getElementById('paidLeaveGranted').textContent = `${totalGranted}日`;
        document.getElementById('paidLeaveUsed').textContent = `${totalUsed}日`;
    },
    
    renderRequests() {
        const tbody = document.getElementById('leaveRequestTableBody');
        const cardList = document.getElementById('leaveRequestCardList');
        const noDataMsg = document.getElementById('noLeaveRequestMessage');
        const statusFilter = document.getElementById('leaveStatusFilter').value;
        
        // ステータスでフィルタリング
        let filteredRequests = app.leaveRequests;
        
        // 一般ユーザーは自分の申請のみ表示
        if (app.currentUser.role !== 'admin') {
            filteredRequests = filteredRequests.filter(lr => lr.employee_id === app.currentUser.id);
        }
        
        if (statusFilter) {
            filteredRequests = filteredRequests.filter(lr => lr.status === statusFilter);
        }
        
        if (filteredRequests.length === 0) {
            tbody.innerHTML = '';
            if (cardList) cardList.innerHTML = '';
            noDataMsg.classList.remove('hidden');
            return;
        }

        noDataMsg.classList.add('hidden');

        // 並び順を新しい申請日順で固定
        const sortedRequests = [...filteredRequests].sort(this.sortRequestsByNewest);

        // 管理者かどうかで表示制御
        const isAdmin = app.currentUser.role === 'admin';
        const nameHeader = document.getElementById('leaveRequestNameHeader');
        const actionHeader = document.getElementById('leaveRequestActionHeader');
        
        if (!isAdmin) {
            // 一般ユーザーは申請者列と操作列を非表示
            nameHeader.style.display = 'none';
            actionHeader.style.display = 'none';
        } else {
            nameHeader.style.display = '';
            actionHeader.style.display = '';
        }
        
        const html = sortedRequests.map(request => {
            const employee = app.allEmployees.find(e => e.id === request.employee_id);
            const employeeName = employee ? employee.name : '不明';

            const statusBadge = {
                'pending': '<span class="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">承認待ち</span>',
                'approved': '<span class="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">承認済み</span>',
                'rejected': '<span class="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">却下</span>'
            }[request.status] || '-';
            
            // 申請者列（管理者のみ）
            const nameColumn = isAdmin 
                ? `<td class="px-3 py-3 text-xs font-medium whitespace-nowrap sticky-col-left" style="position: sticky; left: 0; z-index: 5; background-color: white;">${employeeName}</td>`
                : '';
            
            // 操作列（管理者のみ）
            let actionColumn = '';
            if (isAdmin) {
                if (request.status === 'pending') {
                    actionColumn = `
                        <td class="px-2 py-2 text-xs sticky-col-left" style="position: sticky; left: 100px; z-index: 5; background-color: white;">
                            <button onclick="paidLeave.approveRequest('${request.id}')" 
                                    class="px-2 py-1 rounded text-xs font-bold bg-green-500 hover:bg-green-600 text-white"
                                    title="承認">
                                承認
                            </button>
                        </td>
                    `;
                } else if (request.status === 'approved') {
                    actionColumn = `
                        <td class="px-2 py-2 text-xs sticky-col-left" style="position: sticky; left: 100px; z-index: 5; background-color: white;">
                            <button onclick="paidLeave.cancelApproval('${request.id}')" 
                                    class="px-2 py-1 rounded text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white"
                                    title="承認取り消し">
                                取消
                            </button>
                        </td>
                    `;
                } else {
                    actionColumn = `<td class="px-2 py-2 text-xs sticky-col-left" style="position: sticky; left: 100px; z-index: 5; background-color: white;">-</td>`;
                }
            }
            
            // 一般ユーザーは削除ボタンを表示（承認待ちのみ）
            if (!isAdmin && request.status === 'pending') {
                actionColumn = `
                    <td class="px-2 py-2 text-xs">
                        <button onclick="paidLeave.cancelRequest('${request.id}')" 
                                class="px-2 py-1 rounded text-xs font-medium bg-red-500 hover:bg-red-600 text-white"
                                title="申請取り消し">
                            取消
                        </button>
                    </td>
                `;
            } else if (!isAdmin) {
                actionColumn = `<td class="px-2 py-2 text-xs">-</td>`;
            }
            
            return `
            <tr class="hover:bg-gray-50">
                ${nameColumn}
                ${actionColumn}
                <td class="px-3 py-3 text-xs whitespace-nowrap">${utils.formatDate(request.request_date)}</td>
                <td class="px-3 py-3 text-xs whitespace-nowrap">${utils.formatDate(request.leave_date)}</td>
                <td class="px-3 py-3 text-xs whitespace-nowrap">${request.leave_type}</td>
                <td class="px-3 py-3 text-xs font-bold whitespace-nowrap">${request.leave_days}日</td>
                <td class="px-3 py-3 text-xs text-gray-600">${request.reason || '-'}</td>
                <td class="px-3 py-3 text-xs whitespace-nowrap">${statusBadge}</td>
            </tr>
        `}).join('');
        
        tbody.innerHTML = html;

        if (cardList) {
            const cardHtml = sortedRequests.map(request => {
                const employee = app.allEmployees.find(e => e.id === request.employee_id);
                const employeeName = employee ? employee.name : '不明';

                const statusBadge = {
                    'pending': '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 text-yellow-800">承認待ち</span>',
                    'approved': '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">承認済み</span>',
                    'rejected': '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">却下</span>'
                }[request.status] || '-';

                let actionButton = '';
                if (isAdmin) {
                    if (request.status === 'pending') {
                        actionButton = `<button onclick=\"paidLeave.approveRequest('${request.id}')\" class=\"px-3 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1\"><i class=\"fas fa-check\"></i><span>承認</span></button>`;
                    } else if (request.status === 'approved') {
                        actionButton = `<button onclick=\"paidLeave.cancelApproval('${request.id}')\" class=\"px-3 py-2 text-xs font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600 flex items-center gap-1\"><i class=\"fas fa-undo\"></i><span>取消</span></button>`;
                    }
                } else if (request.status === 'pending') {
                    actionButton = `<button onclick=\"paidLeave.cancelRequest('${request.id}')\" class=\"px-3 py-2 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center gap-1\"><i class=\"fas fa-times\"></i><span>取消</span></button>`;
                }

                return `
                <div class="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-2">
                    <div class="flex items-start gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                <span>${utils.formatDate(request.leave_date)}</span>
                                ${statusBadge}
                            </div>
                            ${isAdmin ? `<div class="text-[11px] text-gray-500 mt-1">${employeeName}</div>` : ''}
                            <div class="mt-2 text-[11px] text-gray-600 flex flex-wrap gap-2">
                                <span class="flex items-center gap-1"><i class="fas fa-file-alt"></i>${utils.formatDate(request.request_date)} 申請</span>
                                <span class="flex items-center gap-1"><i class="fas fa-sun"></i>${request.leave_type}</span>
                                <span class="flex items-center gap-1"><i class="fas fa-umbrella-beach"></i>${request.leave_days}日</span>
                            </div>
                        </div>
                        ${actionButton ? `<div class="shrink-0">${actionButton}</div>` : ''}
                    </div>
                    <div class="text-[11px] text-gray-600">理由: ${request.reason || 'なし'}</div>
                </div>
                `;
            }).join('');

            cardList.innerHTML = cardHtml;
        }
    },
    
    async submitRequest(event) {
        event.preventDefault();
        
        const leaveType = document.getElementById('leaveType').value;
        const leaveDate = document.getElementById('leaveDate').value;
        const reason = document.getElementById('leaveReason').value;
        
        // 休暇日数を計算
        const leaveDays = leaveType === '全日' ? 1.0 : 0.5;
        
        // 残日数チェック
        const myLeaves = app.paidLeaves.filter(pl => 
            pl.employee_id === app.currentUser.id && pl.status === 'active'
        );
        const totalRemaining = myLeaves.reduce((sum, pl) => sum + (pl.remaining_days || 0), 0);
        
        if (totalRemaining < leaveDays) {
            utils.showToast('有給休暇の残日数が不足しています', 'error');
            return;
        }
        
        const data = {
            employee_id: app.currentUser.id,
            leave_type: leaveType,
            request_date: utils.getCurrentDate(),
            leave_date: leaveDate,
            leave_days: leaveDays,
            reason: reason,
            status: 'pending'
        };
        
        try {
            await api.createLeaveRequest(data);
            utils.showToast('有給申請を送信しました', 'success');
            document.getElementById('leaveRequestForm').reset();
            await this.loadPaidLeave();
        } catch (error) {
            console.error('有給申請エラー:', error);
            utils.showToast('申請に失敗しました', 'error');
        }
    },
    
    async approveRequest(requestId) {
        if (!confirm('この申請を承認しますか？')) return;
        
        try {
            const request = app.leaveRequests.find(lr => lr.id === requestId);
            if (!request) return;
            
            // 申請を承認
            await api.updateLeaveRequest(requestId, {
                status: 'approved',
                approver_id: app.currentUser.id,
                approved_at: new Date().toISOString()
            });
            
            // 有給残日数を減らす（古い付与から順に消化）
            const employeeLeaves = app.paidLeaves
                .filter(pl => pl.employee_id === request.employee_id && pl.status === 'active' && pl.remaining_days > 0)
                .sort((a, b) => a.grant_date.localeCompare(b.grant_date));
            
            let remainingToDeduct = request.leave_days;
            
            for (const leave of employeeLeaves) {
                if (remainingToDeduct <= 0) break;
                
                const deductAmount = Math.min(leave.remaining_days, remainingToDeduct);
                const newRemaining = leave.remaining_days - deductAmount;
                const newUsed = leave.used_days + deductAmount;
                
                await api.updatePaidLeave(leave.id, {
                    remaining_days: newRemaining,
                    used_days: newUsed
                });
                
                remainingToDeduct -= deductAmount;
            }
            
            utils.showToast('申請を承認しました', 'success');
            await this.loadPaidLeave();
        } catch (error) {
            console.error('承認エラー:', error);
            utils.showToast('承認に失敗しました', 'error');
        }
    },
    
    async rejectRequest(requestId) {
        const reason = prompt('却下理由を入力してください（任意）');
        if (reason === null) return; // キャンセル
        
        try {
            await api.updateLeaveRequest(requestId, {
                status: 'rejected',
                approver_id: app.currentUser.id,
                approved_at: new Date().toISOString(),
                rejection_reason: reason || '理由なし'
            });
            
            utils.showToast('申請を却下しました', 'success');
            await this.loadPaidLeave();
        } catch (error) {
            console.error('却下エラー:', error);
            utils.showToast('却下に失敗しました', 'error');
        }
    },
    
    async cancelApproval(requestId) {
        if (!confirm('承認を取り消しますか？\n有給残日数は自動的に戻ります。')) return;
        
        try {
            const request = app.leaveRequests.find(lr => lr.id === requestId);
            if (!request || request.status !== 'approved') return;
            
            // 有給残日数を戻す（古い付与から順に戻す）
            const employeeLeaves = app.paidLeaves
                .filter(pl => pl.employee_id === request.employee_id && pl.status === 'active')
                .sort((a, b) => a.grant_date.localeCompare(b.grant_date));
            
            let remainingToRestore = request.leave_days;
            
            for (const leave of employeeLeaves) {
                if (remainingToRestore <= 0) break;
                
                const restoreAmount = Math.min(leave.grant_days - leave.remaining_days, remainingToRestore);
                if (restoreAmount > 0) {
                    const newRemaining = leave.remaining_days + restoreAmount;
                    const newUsed = leave.used_days - restoreAmount;
                    
                    await api.updatePaidLeave(leave.id, {
                        remaining_days: newRemaining,
                        used_days: newUsed
                    });
                    
                    remainingToRestore -= restoreAmount;
                }
            }
            
            // 申請ステータスをpendingに戻す
            await api.updateLeaveRequest(requestId, {
                status: 'pending',
                approver_id: null,
                approved_at: null
            });
            
            utils.showToast('承認を取り消しました', 'success');
            await this.loadPaidLeave();
        } catch (error) {
            console.error('承認取り消しエラー:', error);
            utils.showToast('取り消しに失敗しました', 'error');
        }
    },
    
    async cancelRequest(requestId) {
        if (!confirm('この申請を取り消しますか？')) return;
        
        try {
            await api.deleteLeaveRequest(requestId);
            utils.showToast('申請を取り消しました', 'success');
            await this.loadPaidLeave();
        } catch (error) {
            console.error('申請取り消しエラー:', error);
            utils.showToast('取り消しに失敗しました', 'error');
        }
    }
};

// 初期化
async function init() {
    // 認証チェック
    if (auth.checkAuth()) {
        showScreen('main');
        document.getElementById('currentUserName').textContent = app.currentUser.name;
        const mobileUserName = document.getElementById('currentUserNameMobile');
        if (mobileUserName) mobileUserName.textContent = app.currentUser.name;

        // 管理者の場合は従業員管理タブを表示
        if (app.currentUser.role === 'admin') {
            document.getElementById('employeeManageBtn').classList.remove('hidden');

            // 管理者は打刻タブを非表示
            document.getElementById('clockNavBtn')?.classList.add('hidden');
            document.getElementById('clockView')?.classList.add('hidden');

            // 管理者はデータ出力タブを非表示
            document.getElementById('exportNavBtn')?.classList.add('hidden');
            document.getElementById('exportView')?.classList.add('hidden');
        }

        // 時計開始
        updateClock();
        setInterval(updateClock, 1000);

        // 役割に応じた初期データ読み込み
        if (app.currentUser.role !== 'admin') {
            await clock.loadTodayAttendance();
            showView('clock');
        } else {
            await dashboard.loadDashboard();
            showView('dashboard');
        }
    } else {
        showScreen('login');
    }
}

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    loginAssistant.init();
    shiftSelection.init();
    init();
    
    // PWAモード検知とリロードボタン表示
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true;
    
    if (isPWA) {
        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) {
            reloadBtn.classList.remove('hidden');
        }
        
        // プルトゥリフレッシュ機能を有効化
        initPullToRefresh();
    }
    
    // リロードボタン
    document.getElementById('reloadBtn')?.addEventListener('click', () => {
        location.reload();
    });
    
    // ログインフォーム
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const employeeNumber = document.getElementById('employeeNumber').value;
        const result = await auth.login(employeeNumber);
        
        if (result.success) {
            location.reload();
        } else {
            const errorDiv = document.getElementById('loginError');
            const errorMsg = document.getElementById('loginErrorMessage');
            errorMsg.textContent = result.message;
            errorDiv.classList.remove('hidden');
        }
    });
    
    // ログアウト
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('ログアウトしますか？')) {
            auth.logout();
            location.reload();
        }
    });
    
    // ナビゲーション
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const view = btn.dataset.view;
            showView(view);
            
            // データ読み込み
            if (view === 'dashboard') {
                await dashboard.loadDashboard();
            } else if (view === 'attendance') {
                await attendance.loadAttendance();
            } else if (view === 'compensatory') {
                await compensatoryManagement.loadCompensatory();
            } else if (view === 'paidleave') {
                await paidLeave.loadPaidLeave();
            } else if (view === 'employees') {
                await employees.loadEmployees();
            } else if (view === 'export') {
                // デフォルト日付設定
                const today = utils.getCurrentDate();
                const firstDay = today.substring(0, 8) + '01';
                document.getElementById('exportStartDate').value = firstDay;
                document.getElementById('exportEndDate').value = today;
                
                // 従業員チェックボックスを読み込み
                if (app.allEmployees.length === 0) {
                    app.allEmployees = await api.getEmployees();
                }
                exportData.loadEmployeeCheckboxes();
            }
        });
    });
    
    // 打刻ボタン
    document.getElementById('clockInBtn').addEventListener('click', () => clock.clockIn());
    document.getElementById('clockOutBtn').addEventListener('click', () => clock.clockOut());
    document.getElementById('resetClockBtn').addEventListener('click', () => clock.resetClock());
    
    // ダッシュボードフィルター
    document.getElementById('dashboardFilterBtn').addEventListener('click', () => dashboard.updateDashboard());
    document.getElementById('dashboardEmployeeFilter').addEventListener('change', () => dashboard.updateDashboard());
    document.getElementById('dashboardMonthFilter').addEventListener('change', () => dashboard.updateDashboard());
    
    // 勤怠フィルター
    document.getElementById('filterBtn').addEventListener('click', () => attendance.filterByMonth());
    document.getElementById('employeeFilter').addEventListener('change', () => attendance.filterByMonth());
    document.getElementById('monthFilter').addEventListener('change', () => attendance.filterByMonth());
    
    // 振替休暇フィルター
    document.getElementById('compensatoryFilterBtn').addEventListener('click', () => compensatoryManagement.filterCompensatory());
    
    // CSV出力
    document.getElementById('exportCsvBtn').addEventListener('click', () => exportData.exportCSV());
    
    // 従業員管理
    document.getElementById('addEmployeeBtn').addEventListener('click', () => employees.showModal());
    document.getElementById('cancelEmployeeBtn').addEventListener('click', () => employees.hideModal());
    document.getElementById('employeeForm').addEventListener('submit', (e) => employees.saveEmployee(e));
    
    // 勤怠編集
    document.getElementById('cancelAttendanceBtn').addEventListener('click', () => {
        document.getElementById('attendanceModal').classList.add('hidden');
    });
    document.getElementById('deleteAttendanceBtn').addEventListener('click', () => attendance.deleteAttendanceFromModal());
    document.getElementById('attendanceEditForm').addEventListener('submit', (e) => attendance.saveAttendance(e));
    
    // 勤怠新規追加
    document.getElementById('addAttendanceBtn').addEventListener('click', () => attendance.showAddModal());
    document.getElementById('cancelAddAttendanceBtn').addEventListener('click', () => attendance.hideAddModal());
    document.getElementById('addAttendanceForm').addEventListener('submit', (e) => attendance.saveNewAttendance(e));
    
    // 振替使用日選択モーダル
    document.getElementById('cancelUsedDateBtn').addEventListener('click', () => compensatoryManagement.hideUsedDateModal());
    document.getElementById('usedDateForm').addEventListener('submit', (e) => compensatoryManagement.submitUsedDate(e));
    
    // 有給申請
    document.getElementById('leaveRequestForm').addEventListener('submit', (e) => paidLeave.submitRequest(e));
    document.getElementById('leaveStatusFilter').addEventListener('change', () => paidLeave.renderRequests());
    
    // 月フィルターのデフォルト値
    const currentMonth = new Date().toISOString().substring(0, 7);
    document.getElementById('monthFilter').value = currentMonth;
});

// プルトゥリフレッシュ機能
function initPullToRefresh() {
    const pullToRefresh = document.getElementById('pullToRefresh');
    const refreshIcon = document.getElementById('refreshIcon');
    const refreshText = document.getElementById('refreshText');
    
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let isRefreshing = false;
    const threshold = 80; // 引っ張る距離の閾値（ピクセル）
    
    // タッチ開始
    document.addEventListener('touchstart', (e) => {
        // ページが一番上にいる時のみ有効
        if (window.scrollY === 0 && !isRefreshing) {
            startY = e.touches[0].clientY;
            isDragging = true;
        }
    }, { passive: true });
    
    // タッチ移動
    document.addEventListener('touchmove', (e) => {
        if (!isDragging || isRefreshing) return;
        
        currentY = e.touches[0].clientY;
        const pullDistance = currentY - startY;
        
        // 下方向にのみ反応
        if (pullDistance > 0) {
            // 引っ張り距離に応じてインジケーターの高さを変更
            const displayDistance = Math.min(pullDistance, threshold * 1.5);
            const opacity = Math.min(displayDistance / threshold, 1);
            
            pullToRefresh.style.height = `${displayDistance}px`;
            pullToRefresh.style.opacity = opacity;
            
            // 閾値を超えたらテキストを変更
            if (pullDistance >= threshold) {
                refreshText.textContent = '離して更新';
                refreshIcon.style.transform = 'rotate(180deg)';
            } else {
                refreshText.textContent = '下にスワイプして更新';
                refreshIcon.style.transform = 'rotate(0deg)';
            }
        }
    }, { passive: true });
    
    // タッチ終了
    document.addEventListener('touchend', async () => {
        if (!isDragging || isRefreshing) return;
        
        const pullDistance = currentY - startY;
        
        // 閾値を超えていたらリロード
        if (pullDistance >= threshold) {
            isRefreshing = true;
            
            // リフレッシュアニメーション開始
            pullToRefresh.style.height = '60px';
            pullToRefresh.style.opacity = '1';
            refreshIcon.classList.add('refreshing');
            refreshText.textContent = '更新中...';
            
            // 少し待ってからリロード（ユーザーに視覚的フィードバック）
            setTimeout(() => {
                location.reload();
            }, 500);
        } else {
            // 閾値未満なら元に戻す
            pullToRefresh.style.height = '0';
            pullToRefresh.style.opacity = '0';
            refreshIcon.style.transform = 'rotate(0deg)';
        }
        
        isDragging = false;
        startY = 0;
        currentY = 0;
    });
}
