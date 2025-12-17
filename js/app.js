// グローバル状態管理
const app = {
    currentUser: null,
    todayAttendance: null,
    allEmployees: [],
    allAttendance: [],
    filteredAttendance: [],
    compensatoryLeaves: []
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
        const response = await fetch('tables/employees?limit=100');
        const result = await response.json();
        return result.data;
    },
    
    // 従業員取得（社員番号で検索）
    async getEmployeeByNumber(employeeNumber) {
        const response = await fetch(`tables/employees?search=${employeeNumber}`);
        const result = await response.json();
        return result.data.find(emp => emp.employee_number === employeeNumber);
    },
    
    // 従業員追加
    async createEmployee(data) {
        const response = await fetch('tables/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 従業員更新
    async updateEmployee(id, data) {
        const response = await fetch(`tables/employees/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 従業員削除
    async deleteEmployee(id) {
        await fetch(`tables/employees/${id}`, {
            method: 'DELETE'
        });
    },
    
    // 勤怠記録取得
    async getAttendance() {
        const response = await fetch('tables/attendance?limit=1000&sort=-date');
        const result = await response.json();
        return result.data;
    },
    
    // 勤怠記録取得（特定の従業員と日付）
    async getTodayAttendance(employeeId, date) {
        const response = await fetch('tables/attendance?limit=1000');
        const result = await response.json();
        return result.data.find(att => att.employee_id === employeeId && att.date === date);
    },
    
    // 勤怠記録作成
    async createAttendance(data) {
        const response = await fetch('tables/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 勤怠記録更新
    async updateAttendance(id, data) {
        const response = await fetch(`tables/attendance/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 振替休暇取得
    async getCompensatoryLeaves() {
        const response = await fetch('tables/compensatory_leave?limit=1000&sort=-earned_date');
        const result = await response.json();
        return result.data;
    },
    
    // 振替休暇作成
    async createCompensatoryLeave(data) {
        const response = await fetch('tables/compensatory_leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    
    // 振替休暇更新
    async updateCompensatoryLeave(id, data) {
        const response = await fetch(`tables/compensatory_leave/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    }
};

// ログイン処理
const auth = {
    async login(employeeNumber) {
        const employee = await api.getEmployeeByNumber(employeeNumber);
        
        if (!employee || !employee.is_active) {
            return { success: false, message: '社員番号が見つからないか、無効なアカウントです' };
        }
        
        app.currentUser = employee;
        localStorage.setItem('currentUser', JSON.stringify(employee));
        return { success: true, employee };
    },
    
    logout() {
        app.currentUser = null;
        localStorage.removeItem('currentUser');
        showScreen('login');
    },
    
    checkAuth() {
        const stored = localStorage.getItem('currentUser');
        if (stored) {
            app.currentUser = JSON.parse(stored);
            return true;
        }
        return false;
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

// 打刻処理
const clock = {
    async clockIn() {
        const shiftType = document.querySelector('input[name="shiftType"]:checked').value;
        const clockInTime = utils.getCurrentTime();
        const date = utils.getCurrentDate();
        
        try {
            const attendance = await api.createAttendance({
                employee_id: app.currentUser.id,
                employee_name: app.currentUser.name,
                date: date,
                shift_type: shiftType,
                clock_in: clockInTime,
                clock_out: '',
                break_minutes: 0,
                work_hours: 0,
                note: ''
            });
            
            app.todayAttendance = attendance;
            this.updateTodayStatus();
            this.updateButtons();
            utils.showToast('出勤を記録しました', 'success');
        } catch (error) {
            utils.showToast('出勤の記録に失敗しました', 'error');
        }
    },
    
    async clockOut() {
        const clockOutTime = utils.getCurrentTime();
        const { workHours, breakMinutes } = utils.calculateWorkHours(
            app.todayAttendance.clock_in,
            clockOutTime
        );
        
        try {
            const updatedData = {
                ...app.todayAttendance,
                clock_out: clockOutTime,
                break_minutes: breakMinutes,
                work_hours: workHours
            };
            
            const updated = await api.updateAttendance(app.todayAttendance.id, updatedData);
            app.todayAttendance = updated;
            
            // 休日出勤の場合、振替休暇を記録
            if (app.todayAttendance.shift_type === '休日出勤') {
                const comp = utils.calculateCompensatory(workHours);
                await api.createCompensatoryLeave({
                    employee_id: app.currentUser.id,
                    employee_name: app.currentUser.name,
                    earned_date: app.todayAttendance.date,
                    earned_hours: comp.hours,
                    earned_days: comp.days,
                    used_date: '',
                    used_hours: 0,
                    used_days: 0,
                    status: 'available',
                    note: `休日出勤(${workHours}時間)`
                });
            }
            
            this.updateTodayStatus();
            this.updateButtons();
            utils.showToast('退勤を記録しました', 'success');
        } catch (error) {
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
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <div class="text-sm text-gray-600">シフト</div>
                    <div class="text-lg font-bold text-tsunagu-blue">${shift_type}</div>
                </div>
                <div>
                    <div class="text-sm text-gray-600">出勤時刻</div>
                    <div class="text-lg font-bold text-tsunagu-green">${clock_in}</div>
                </div>
        `;
        
        if (clock_out) {
            html += `
                <div>
                    <div class="text-sm text-gray-600">退勤時刻</div>
                    <div class="text-lg font-bold text-tsunagu-red">${clock_out}</div>
                </div>
                <div>
                    <div class="text-sm text-gray-600">勤務時間</div>
                    <div class="text-lg font-bold text-gray-800">${work_hours}時間</div>
                </div>
            `;
        }
        
        html += '</div>';
        statusContent.innerHTML = html;
    },
    
    updateButtons() {
        const clockInBtn = document.getElementById('clockInBtn');
        const clockOutBtn = document.getElementById('clockOutBtn');
        
        if (!app.todayAttendance) {
            clockInBtn.disabled = false;
            clockOutBtn.disabled = true;
        } else if (app.todayAttendance.clock_out) {
            clockInBtn.disabled = true;
            clockOutBtn.disabled = true;
        } else {
            clockInBtn.disabled = true;
            clockOutBtn.disabled = false;
        }
    },
    
    async loadTodayAttendance() {
        const today = utils.getCurrentDate();
        app.todayAttendance = await api.getTodayAttendance(app.currentUser.id, today);
        this.updateTodayStatus();
        this.updateButtons();
    }
};

// 勤怠一覧
const attendance = {
    async loadAttendance() {
        app.allAttendance = await api.getAttendance();
        app.compensatoryLeaves = await api.getCompensatoryLeaves();
        
        // デフォルトで当月のデータを表示
        this.filterByMonth();
    },
    
    renderTable() {
        const tbody = document.getElementById('attendanceTableBody');
        const noDataMsg = document.getElementById('noDataMessage');
        
        if (app.filteredAttendance.length === 0) {
            tbody.innerHTML = '';
            noDataMsg.classList.remove('hidden');
            return;
        }
        
        noDataMsg.classList.add('hidden');
        
        const html = app.filteredAttendance.map(att => {
            let compensatoryInfo = '-';
            if (att.shift_type === '休日出勤' && att.work_hours > 0) {
                const comp = utils.calculateCompensatory(att.work_hours);
                if (comp.days > 0) {
                    compensatoryInfo = `${comp.days}日`;
                } else {
                    compensatoryInfo = `${comp.hours}時間`;
                }
            }
            
            // 日付を短縮表示（モバイル対応）
            const shortDate = att.date.split('-').slice(1).join('/'); // MM/DD形式
            
            return `
            <tr class="hover:bg-gray-50">
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                    <span class="hidden md:inline">${utils.formatDate(att.date)}</span>
                    <span class="md:hidden">${shortDate}</span>
                </td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium">${att.employee_name}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                    <span class="px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs font-medium ${
                        att.shift_type === '早番' ? 'bg-yellow-100 text-yellow-800' : 
                        att.shift_type === '遅番' ? 'bg-blue-100 text-blue-800' : 
                        'bg-red-100 text-red-800'
                    }">
                        ${att.shift_type}
                    </span>
                </td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-green-600 font-medium">${att.clock_in}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-red-600 font-medium">${att.clock_out || '-'}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">${att.break_minutes}分</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-bold">${att.work_hours}時間</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium text-red-600">${compensatoryInfo}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-600">${att.note || '-'}</td>
                <td class="px-2 md:px-4 py-2 md:py-3 text-sm">
                    <button onclick="attendance.editAttendance('${att.id}')" class="text-blue-600 hover:text-blue-800 p-1">
                        <i class="fas fa-edit text-sm md:text-base"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
        
        tbody.innerHTML = html;
        this.updateHolidaySummary();
    },
    
    updateHolidaySummary() {
        const summaryContent = document.getElementById('holidaySummaryContent');
        
        // 従業員ごとの振替休暇集計
        const employeeSummary = {};
        
        app.compensatoryLeaves.forEach(leave => {
            if (leave.status === 'available') {
                if (!employeeSummary[leave.employee_id]) {
                    employeeSummary[leave.employee_id] = {
                        name: leave.employee_name,
                        days: 0,
                        hours: 0,
                        items: []
                    };
                }
                employeeSummary[leave.employee_id].days += leave.earned_days;
                employeeSummary[leave.employee_id].hours += leave.earned_hours;
                employeeSummary[leave.employee_id].items.push(leave);
            }
        });
        
        if (Object.keys(employeeSummary).length === 0) {
            summaryContent.innerHTML = '<p class="text-gray-600 text-sm md:text-base">振替休暇の蓄積はありません</p>';
            return;
        }
        
        const html = Object.values(employeeSummary).map(summary => `
            <div class="bg-white rounded-lg p-3 md:p-4 shadow">
                <div class="font-bold text-gray-800 mb-2 text-sm md:text-base">${summary.name}</div>
                <div class="text-xl md:text-2xl font-bold text-red-600 mb-2">
                    ${summary.days > 0 ? `${summary.days}日` : ''}${summary.days > 0 && summary.hours > 0 ? ' + ' : ''}${summary.hours > 0 ? `${summary.hours}時間` : ''}
                </div>
                <button onclick="compensatory.showUseModal('${summary.items[0].employee_id}')" 
                        class="text-xs md:text-sm bg-tsunagu-blue text-white px-2 md:px-3 py-1 rounded hover:bg-blue-700 transition w-full sm:w-auto">
                    <i class="fas fa-calendar-check mr-1"></i>振替使用
                </button>
            </div>
        `).join('');
        
        summaryContent.innerHTML = html;
    },
    
    filterByMonth() {
        const monthInput = document.getElementById('monthFilter');
        const targetMonth = monthInput.value;
        
        if (!targetMonth) {
            app.filteredAttendance = [...app.allAttendance];
        } else {
            app.filteredAttendance = app.allAttendance.filter(att => att.date.startsWith(targetMonth));
        }
        
        this.renderTable();
    },
    
    editAttendance(id) {
        const att = app.allAttendance.find(a => a.id === id);
        if (!att) return;
        
        document.getElementById('editAttendanceId').value = att.id;
        document.getElementById('editDate').value = att.date;
        document.getElementById('editEmployeeName').value = att.employee_name;
        document.getElementById('editShiftType').value = att.shift_type;
        document.getElementById('editClockIn').value = att.clock_in;
        document.getElementById('editClockOut').value = att.clock_out || '';
        document.getElementById('editNote').value = att.note || '';
        
        document.getElementById('attendanceModal').classList.remove('hidden');
    },
    
    async saveAttendance(event) {
        event.preventDefault();
        
        const id = document.getElementById('editAttendanceId').value;
        const clockIn = document.getElementById('editClockIn').value;
        const clockOut = document.getElementById('editClockOut').value;
        
        const { workHours, breakMinutes } = utils.calculateWorkHours(clockIn, clockOut);
        
        const data = {
            date: document.getElementById('editDate').value,
            shift_type: document.getElementById('editShiftType').value,
            clock_in: clockIn,
            clock_out: clockOut,
            break_minutes: breakMinutes,
            work_hours: workHours,
            note: document.getElementById('editNote').value
        };
        
        // 既存のデータを取得して保持
        const existingAtt = app.allAttendance.find(a => a.id === id);
        const fullData = { ...existingAtt, ...data };
        
        try {
            await api.updateAttendance(id, fullData);
            utils.showToast('勤怠情報を更新しました', 'success');
            document.getElementById('attendanceModal').classList.add('hidden');
            await this.loadAttendance();
        } catch (error) {
            utils.showToast('更新に失敗しました', 'error');
        }
    }
};

// 振替休暇管理
const compensatory = {
    showUseModal(employeeId) {
        const leaves = app.compensatoryLeaves.filter(
            l => l.employee_id === employeeId && l.status === 'available'
        );
        
        if (leaves.length === 0) {
            utils.showToast('利用可能な振替休暇がありません', 'info');
            return;
        }
        
        const employee = leaves[0].employee_name;
        let totalDays = 0;
        let totalHours = 0;
        
        leaves.forEach(l => {
            totalDays += l.earned_days;
            totalHours += l.earned_hours;
        });
        
        const message = `${employee}さんの振替休暇を使用しますか？\n\n利用可能: ${totalDays > 0 ? totalDays + '日' : ''}${totalDays > 0 && totalHours > 0 ? ' + ' : ''}${totalHours > 0 ? totalHours + '時間' : ''}\n\n※ 最も古い振替から順に消化されます`;
        
        if (confirm(message)) {
            this.useCompensatory(employeeId);
        }
    },
    
    async useCompensatory(employeeId) {
        const leaves = app.compensatoryLeaves.filter(
            l => l.employee_id === employeeId && l.status === 'available'
        ).sort((a, b) => a.earned_date.localeCompare(b.earned_date));
        
        if (leaves.length === 0) return;
        
        // 最も古い振替を1つ消化
        const leave = leaves[0];
        const today = utils.getCurrentDate();
        
        try {
            await api.updateCompensatoryLeave(leave.id, {
                ...leave,
                status: 'used',
                used_date: today,
                used_days: leave.earned_days,
                used_hours: leave.earned_hours
            });
            
            utils.showToast('振替休暇を使用しました', 'success');
            await attendance.loadAttendance();
        } catch (error) {
            utils.showToast('振替休暇の使用に失敗しました', 'error');
        }
    }
};

// CSV出力
const exportData = {
    async exportCSV() {
        const startDate = document.getElementById('exportStartDate').value;
        const endDate = document.getElementById('exportEndDate').value;
        
        if (!startDate || !endDate) {
            utils.showToast('開始日と終了日を選択してください', 'error');
            return;
        }
        
        const data = await api.getAttendance();
        const filtered = data.filter(att => {
            return att.date >= startDate && att.date <= endDate;
        });
        
        if (filtered.length === 0) {
            utils.showToast('指定期間のデータがありません', 'info');
            return;
        }
        
        // CSV生成
        const headers = ['日付', '氏名', 'シフト', '出勤時刻', '退勤時刻', '休憩時間(分)', '勤務時間(時間)', '振替', '備考'];
        const rows = filtered.map(att => {
            let compInfo = '';
            if (att.shift_type === '休日出勤' && att.work_hours > 0) {
                const comp = utils.calculateCompensatory(att.work_hours);
                compInfo = comp.days > 0 ? `${comp.days}日` : `${comp.hours}時間`;
            }
            
            return [
                att.date,
                att.employee_name,
                att.shift_type,
                att.clock_in,
                att.clock_out || '',
                att.break_minutes,
                att.work_hours,
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
                    <span class="px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs font-medium ${emp.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${emp.is_active ? '有効' : '無効'}
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
            is_active: true
        };
        
        try {
            if (id) {
                await api.updateEmployee(id, data);
                utils.showToast('従業員情報を更新しました', 'success');
            } else {
                await api.createEmployee(data);
                utils.showToast('従業員を追加しました', 'success');
            }
            
            this.hideModal();
            await this.loadEmployees();
        } catch (error) {
            utils.showToast('保存に失敗しました', 'error');
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

// 初期化
async function init() {
    // 認証チェック
    if (auth.checkAuth()) {
        showScreen('main');
        document.getElementById('currentUserName').textContent = app.currentUser.name;
        
        // 管理者の場合は従業員管理タブを表示
        if (app.currentUser.role === 'admin') {
            document.getElementById('employeeManageBtn').classList.remove('hidden');
        }
        
        // 時計開始
        updateClock();
        setInterval(updateClock, 1000);
        
        // 今日の勤怠読み込み
        await clock.loadTodayAttendance();
        
        // 初期表示は打刻画面
        showView('clock');
    } else {
        showScreen('login');
    }
}

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    init();
    
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
            if (view === 'attendance') {
                await attendance.loadAttendance();
            } else if (view === 'employees') {
                await employees.loadEmployees();
            } else if (view === 'export') {
                // デフォルト日付設定
                const today = utils.getCurrentDate();
                const firstDay = today.substring(0, 8) + '01';
                document.getElementById('exportStartDate').value = firstDay;
                document.getElementById('exportEndDate').value = today;
            }
        });
    });
    
    // 打刻ボタン
    document.getElementById('clockInBtn').addEventListener('click', () => clock.clockIn());
    document.getElementById('clockOutBtn').addEventListener('click', () => clock.clockOut());
    
    // 勤怠フィルター
    document.getElementById('filterBtn').addEventListener('click', () => attendance.filterByMonth());
    
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
    document.getElementById('attendanceEditForm').addEventListener('submit', (e) => attendance.saveAttendance(e));
    
    // 月フィルターのデフォルト値
    const currentMonth = new Date().toISOString().substring(0, 7);
    document.getElementById('monthFilter').value = currentMonth;
});
