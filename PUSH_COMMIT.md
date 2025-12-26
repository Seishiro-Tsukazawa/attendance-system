有給休暇管理機能を実装

■ 実装内容
- 有給休暇タブの追加（ナビゲーション）
- 有給残日数カードの表示（残日数/付与/使用）
- 有給申請フォーム（全日/半日AM/半日PM）
- 申請一覧とステータス管理（承認待ち/承認済み/却下）
- 管理者向け承認/却下機能
- 承認時の有給残日数自動減算（古い付与から順に消化）
- API追加: getPaidLeaves, getLeaveRequests, createLeaveRequest, updateLeaveRequest, updatePaidLeave

■ 変更ファイル
- index.html: 有給休暇ビューとナビゲーションタブを追加
- js/app.js: paidLeaveオブジェクトを実装、API関数追加、イベントリスナー追加

■ データベース前提
- paid_leaveテーブル
- leave_requestsテーブル
- employeesテーブルにhire_dateカラム
