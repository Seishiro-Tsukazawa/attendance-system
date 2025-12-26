PWA対応：ホーム画面に追加可能に

■ 実装内容
- manifest.jsonを作成（アプリ名、テーマカラー、アイコン設定）
- HTMLにPWA設定を追加（manifest読み込み、Apple Touch Icon設定）
- スマホのホーム画面に追加可能に
- スタンドアロンモード対応（ブラウザUIなしで起動）
- iOS/Android両対応

■ 変更ファイル
- manifest.json: 新規作成
- index.html: PWA設定追加（head部分）
- icon-generator.html: アイコン生成ツール（開発用）

■ 使用方法
スマホで https://attendance-system.pages.dev を開き、
- iOS: 共有ボタン → ホーム画面に追加
- Android: メニュー → ホーム画面に追加
