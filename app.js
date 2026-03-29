/**
 * 画像生成フォーム全体を表す `form` 要素です。
 *
 * @type {HTMLFormElement}
 */
const form = document.getElementById("image-form");

/**
 * 入力画像を選択するためのファイル入力です。
 *
 * @type {HTMLInputElement}
 */
const imageInput = document.getElementById("image-input");

/**
 * 出力する正方形の一辺を入力する数値フィールドです。
 *
 * @type {HTMLInputElement}
 */
const squareSizeInput = document.getElementById("square-size");

/**
 * 背景画像に適用するぼかし強度を指定するレンジ入力です。
 *
 * UI 上は割合で扱い、実際のぼかし半径は出力サイズに応じて
 * ピクセル値へ変換して利用します。
 *
 * @type {HTMLInputElement}
 */
const blurAmountInput = document.getElementById("blur-amount");

/**
 * 現在のぼかし強度を文字列として画面表示する要素です。
 *
 * @type {HTMLElement}
 */
const blurValue = document.getElementById("blur-value");

/**
 * メイン画像の表示倍率を指定するレンジ入力です。
 *
 * 100 を基準値とし、値が大きいほどメイン画像を大きく表示します。
 *
 * @type {HTMLInputElement}
 */
const mainScaleInput = document.getElementById("main-scale");

/**
 * 現在のメイン画像倍率を文字列として画面表示する要素です。
 *
 * @type {HTMLElement}
 */
const mainScaleValue = document.getElementById("main-scale-value");

/**
 * ライブ生成を有効化するチェックボックスです。
 *
 * @type {HTMLInputElement}
 */
const liveGenerateInput = document.getElementById("live-generate");

/**
 * ユーザー向けの状態メッセージを表示する要素です。
 *
 * @type {HTMLElement}
 */
const statusMessage = document.getElementById("status-message");

/**
 * 手動生成を行う送信ボタンです。
 *
 * @type {HTMLButtonElement}
 */
const generateButton = document.getElementById("generate-button");

/**
 * 生成済み画像をダウンロードするためのボタンです。
 *
 * @type {HTMLButtonElement}
 */
const downloadButton = document.getElementById("download-button");

/**
 * 生成結果のプレビューと最終画像の描画先になる `canvas` 要素です。
 *
 * @type {HTMLCanvasElement}
 */
const previewCanvas = document.getElementById("preview-canvas");

/**
 * `previewCanvas` に対して描画を行う 2D コンテキストです。
 *
 * @type {CanvasRenderingContext2D}
 */
const previewContext = previewCanvas.getContext("2d");

/**
 * キャンバスの初期表示サイズです。
 * 画像未選択時や仮プレビュー表示時に利用します。
 *
 * @type {number}
 */
const DEFAULT_PREVIEW_SIZE = 1080;

/**
 * 現在読み込み済みの画像オブジェクトです。
 * 画像未選択時は `null` を保持します。
 *
 * @type {HTMLImageElement | null}
 */
let currentImage = null;

/**
 * 直近で生成した PNG 画像の Data URL です。
 * ダウンロード時にこの値を利用します。
 *
 * @type {string}
 */
let outputDataUrl = "";

/**
 * ぼかし強度スライダーの変更時に表示テキストを更新し、
 * ライブ生成が有効なら即座に再描画します。
 */
blurAmountInput.addEventListener("input", () => {
  blurValue.textContent = `${blurAmountInput.value}%`;
  generateIfLive();
});

/**
 * メイン画像の表示倍率が変更されたときに表示テキストを更新し、
 * ライブ生成が有効なら即座に再描画します。
 */
mainScaleInput.addEventListener("input", () => {
  mainScaleValue.textContent = `${mainScaleInput.value}%`;
  generateIfLive();
});

/**
 * 正方形サイズが変更されたとき、
 * ライブ生成が有効なら即座に再描画します。
 */
squareSizeInput.addEventListener("input", () => {
  generateIfLive();
});

/**
 * ライブ生成の ON/OFF を切り替えたときの処理です。
 * ON の場合はボタン状態を同期し、その場で一度生成を走らせます。
 */
liveGenerateInput.addEventListener("change", () => {
  syncGenerateButtonState();

  if (liveGenerateInput.checked) {
    generateImage();
  }
});

/**
 * 画像ファイルが選択されたときの処理です。
 * 画像を読み込んだ後、プレビュー描画と必要に応じたライブ生成を行います。
 */
imageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;

  if (!file) {
    currentImage = null;
    outputDataUrl = "";
    downloadButton.disabled = true;
    updateStatus("画像ファイルが未選択です。");
    clearCanvasPreview();
    return;
  }

  try {
    currentImage = await loadImage(file);
    outputDataUrl = "";
    downloadButton.disabled = true;
    updateStatus(
      `画像を読み込みました: ${currentImage.naturalWidth} x ${currentImage.naturalHeight}`
    );
    drawPlaceholderPreview(currentImage);
    generateIfLive();
  } catch (error) {
    currentImage = null;
    outputDataUrl = "";
    downloadButton.disabled = true;
    updateStatus("画像の読み込みに失敗しました。別のファイルを試してください。");
    clearCanvasPreview();
  }
});

/**
 * フォーム送信時の標準動作を抑止し、手動生成を実行します。
 */
form.addEventListener("submit", (event) => {
  event.preventDefault();
  generateImage();
});

/**
 * ダウンロードボタン押下時に、生成済み画像を PNG として保存します。
 */
downloadButton.addEventListener("click", () => {
  if (!outputDataUrl) {
    updateStatus("先に画像を生成してください。");
    return;
  }

  const link = document.createElement("a");
  link.href = outputDataUrl;
  link.download = createDownloadName();
  link.click();
});

syncGenerateButtonState();

/**
 * 現在のフォーム入力値を基に、正方形画像を 1 枚生成します。
 * ライブ生成時と手動生成時の両方から利用される中核処理です。
 *
 * @returns {void}
 */
function generateImage() {
  if (!currentImage) {
    updateStatus("先に画像を選択してください。");
    return;
  }

  const requestedSize = Number.parseInt(squareSizeInput.value, 10);
  const blurStrength = Number.parseInt(blurAmountInput.value, 10) || 0;
  const mainScalePercent = Number.parseInt(mainScaleInput.value, 10) || 100;
  const squareSize = Number.isFinite(requestedSize) && requestedSize > 0
    ? requestedSize
    : Math.max(currentImage.naturalWidth, currentImage.naturalHeight);
  const blurAmount = convertBlurStrengthToPixels(blurStrength, squareSize);

  renderSquareImage(currentImage, squareSize, blurAmount, mainScalePercent);
  outputDataUrl = previewCanvas.toDataURL("image/png");
  downloadButton.disabled = false;
  updateStatus(`生成完了: ${squareSize} x ${squareSize} の画像を作成しました。`);
}

/**
 * ライブ生成が有効な場合のみ、画像生成処理を呼び出します。
 * 入力変更イベントから安全に共有するための薄いラッパーです。
 *
 * @returns {void}
 */
function generateIfLive() {
  if (liveGenerateInput.checked) {
    generateImage();
  }
}

/**
 * ライブ生成の状態に合わせて、手動生成ボタンの有効/無効を切り替えます。
 *
 * @returns {void}
 */
function syncGenerateButtonState() {
  generateButton.disabled = liveGenerateInput.checked;
}

/**
 * UI 上のぼかし強度(%)を、実際に `canvas` へ渡すぼかし半径(px)へ変換します。
 *
 * 強度 100% を「正方形サイズの 10%」として扱うことで、
 * 小さい画像では弱くなりすぎず、大きい画像では相対的に不足しにくい
 * ぼかし量に調整します。
 *
 * @param {number} blurStrength 0 から 100 のぼかし強度です。
 * @param {number} squareSize 出力する正方形の一辺の長さです。
 * @returns {number} `canvas` の `blur()` に渡すピクセル値です。
 */
function convertBlurStrengthToPixels(blurStrength, squareSize) {
  return squareSize * (blurStrength / 100) * 0.1;
}

/**
 * 選択された画像ファイルを `HTMLImageElement` として非同期に読み込みます。
 *
 * `URL.createObjectURL()` を利用して一時 URL を作り、
 * 読み込み完了または失敗時に `URL.revokeObjectURL()` で解放します。
 *
 * @param {File} file 読み込む画像ファイルです。
 * @returns {Promise<HTMLImageElement>} 読み込み完了後の画像要素を返します。
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };

    image.src = objectUrl;
  });
}

/**
 * 指定サイズの正方形キャンバスを準備し、
 * 背景レイヤーとメインレイヤーを順番に描画します。
 *
 * @param {HTMLImageElement} image 描画元の画像です。
 * @param {number} squareSize 出力する正方形の一辺の長さです。
 * @param {number} blurAmount 背景レイヤーに適用するぼかし量(px)です。
 * @param {number} mainScalePercent メイン画像の表示倍率です。100 が初期値です。
 * @returns {void}
 */
function renderSquareImage(image, squareSize, blurAmount, mainScalePercent) {
  previewCanvas.width = squareSize;
  previewCanvas.height = squareSize;
  previewContext.clearRect(0, 0, squareSize, squareSize);

  drawBackgroundLayer(image, squareSize, blurAmount);
  drawMainLayer(image, squareSize, mainScalePercent);
}

/**
 * 背景用画像を正方形全面に敷き詰めるように描画します。
 *
 * 短辺を基準に拡大するため、長辺側はキャンバス外にはみ出し、
 * 中央配置された状態でトリミングされます。
 * その後、背景として馴染みやすくするためにぼかしと薄いオーバーレイを重ねます。
 *
 * @param {HTMLImageElement} image 描画元の画像です。
 * @param {number} squareSize 出力する正方形の一辺の長さです。
 * @param {number} blurAmount 背景に適用するぼかし量(px)です。
 * @returns {void}
 */
function drawBackgroundLayer(image, squareSize, blurAmount) {
  const scale = squareSize / Math.min(image.naturalWidth, image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const offsetX = (squareSize - drawWidth) / 2;
  const offsetY = (squareSize - drawHeight) / 2;

  previewContext.save();
  previewContext.filter = `blur(${blurAmount}px)`;
  previewContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  previewContext.restore();

  previewContext.save();
  previewContext.fillStyle = "rgba(28, 18, 10, 0.14)";
  previewContext.fillRect(0, 0, squareSize, squareSize);
  previewContext.restore();
}

/**
 * メイン画像を正方形の中に完全に収まるように描画します。
 *
 * 長辺を基準にリサイズするため、画像全体が見切れずに表示されます。
 * 余白が出る場合は中央寄せで配置されます。
 *
 * @param {HTMLImageElement} image 描画元の画像です。
 * @param {number} squareSize 出力する正方形の一辺の長さです。
 * @param {number} mainScalePercent メイン画像の表示倍率です。100 で初期サイズです。
 * @returns {void}
 */
function drawMainLayer(image, squareSize, mainScalePercent) {
  const baseScale = squareSize / Math.max(image.naturalWidth, image.naturalHeight);
  const scale = baseScale * (mainScalePercent / 100);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const offsetX = (squareSize - drawWidth) / 2;
  const offsetY = (squareSize - drawHeight) / 2;

  previewContext.save();
  previewContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  previewContext.restore();
}

/**
 * 画像選択直後に表示する仮プレビューを描画します。
 *
 * まだ出力サイズが未確定でも見た目を確認できるよう、
 * 固定プレビューサイズで一度レンダリングします。
 *
 * @param {HTMLImageElement} image プレビュー対象の画像です。
 * @returns {void}
 */
function drawPlaceholderPreview(image) {
  renderSquareImage(
    image,
    DEFAULT_PREVIEW_SIZE,
    convertBlurStrengthToPixels(
      Number.parseInt(blurAmountInput.value, 10) || 0,
      DEFAULT_PREVIEW_SIZE
    ),
    Number.parseInt(mainScaleInput.value, 10) || 100
  );
}

/**
 * プレビューキャンバスを初期サイズでクリアします。
 * 画像未選択時や読み込み失敗時の表示リセットに使います。
 *
 * @returns {void}
 */
function clearCanvasPreview() {
  previewCanvas.width = DEFAULT_PREVIEW_SIZE;
  previewCanvas.height = DEFAULT_PREVIEW_SIZE;
  previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}

/**
 * ステータスメッセージ表示領域の文言を更新します。
 *
 * @param {string} message 画面に表示するメッセージです。
 * @returns {void}
 */
function updateStatus(message) {
  statusMessage.textContent = message;
}

/**
 * ダウンロード用のファイル名を現在時刻ベースで生成します。
 *
 * コロンやピリオドはファイル名として扱いやすいように
 * ハイフンへ置換しています。
 *
 * @returns {string} 生成画像のファイル名です。
 */
function createDownloadName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `square-image-${timestamp}.png`;
}
