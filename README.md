# Sea Surface

three.js と WebGL2 で描く、FFT ベースのリアルタイム海面シミュレーション。

## 特徴

- **FFT 海洋シミュレーション (Tessendorf)** — GPU 上の Stockham IFFT で 256² × 3 カスケード (420 m / 61 m / 11 m) を毎フレーム計算
- **JONSWAP スペクトル** — TMA 水深補正、周波数依存の cos-2s 方向分布、風浪 + うねりの 2 系統を合成
- **Choppy waves** — 水平変位で尖った波頭を表現し、ヤコビアンから白波（泡）を時間積分
- **シェーディング** — Fresnel 反射、GGX による太陽のきらめき、波頭の透過散乱 (SSS)、距離に応じたラフネス、大気遠近
- **空** — Preetham 大気散乱 + 雲。反射用に太陽円盤なしのキューブマップを毎フレーム生成
- **ポストプロセス** — HDR ハイライト圧縮 → Bloom → ACES トーンマッピング、MSAA 4x
- **プリセット** — Golden Hour / Midday / Sunset / Storm。右上の GUI から全パラメータを調整可能

## 必要環境

- [mise](https://mise.jdx.dev/)（Node.js 24.21.0 LTS と pnpm 12.5.1 を `mise.toml` で固定）
- WebGL2 対応ブラウザ

## セットアップ

```bash
mise install
pnpm install
pnpm dev
```

## スクリプト

| コマンド         | 内容                                 |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | 開発サーバー起動                     |
| `pnpm build`     | 型チェック + 本番ビルド (`dist/`)    |
| `pnpm preview`   | ビルド結果のプレビュー               |
| `pnpm typecheck` | TypeScript 型チェック                |
| `pnpm lint`      | Oxlint                               |
| `pnpm format`    | Oxfmt で整形                         |
| `pnpm check`     | 型チェック + lint + フォーマット確認 |

## 構成

```
src/
├── main.ts                  レンダラー・カメラ・GUI・ループ
├── presets.ts               時間帯/海況プリセット
├── ocean/
│   ├── spectrum.ts          CPU で初期スペクトル h0(k) を生成
│   ├── OceanSimulation.ts   GPU FFT パイプライン（時間発展 → IFFT → 変位/微分/泡）
│   └── OceanSurface.ts      カメラ追従の放射状グリッドメッシュ
├── sky/SkyEnvironment.ts    空と反射用キューブマップ、太陽光の色
└── shaders/                 GLSL (シミュレーション / 海面 / ポスト)
```

## 操作

- ドラッグ: 視点回転
- ホイール: ズーム
