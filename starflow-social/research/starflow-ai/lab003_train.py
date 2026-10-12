"""Starflow AI Lab 003: zero-API 4-step autoregressive video-frame predictor.
This is a tiny research baseline, not a text-to-video/foundation model.
Run on a free Colab CPU or locally. Set USE_OWN_VIDEO=True to upload only
clips you are permitted to send to Colab (remote Google runtime).
"""
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

SEED = 42
SIZE = 48
EPOCHS = 20
HORIZON = 4
USE_OWN_VIDEO = False  # Change to True in Google Colab for an authorized MP4 video.
OUTPUT_DIR = Path("starflow_lab003_output")
OUTPUT_DIR.mkdir(exist_ok=True)

torch.manual_seed(SEED)
np.random.seed(SEED)
torch.set_num_threads(2)


def create_synthetic_clip(n=54):
    """Fully deterministic synthetic motion clip (not real-world footage)."""
    yy, xx = np.mgrid[:SIZE, :SIZE]
    bg = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    bg[:, :, 0] = 15 + (xx * 14 // SIZE)
    bg[:, :, 1] = 18 + (yy * 12 // SIZE)
    bg[:, :, 2] = 36
    frames = []
    for t in range(n):
        image = bg.copy()
        cx = 8 + ((t * 2) % 32)
        cy = 8 + ((t * 1) % 32)
        cv2.rectangle(image, (cx - 3, cy - 3), (cx + 3, cy + 3), (240, 97, 73), -1)
        gx = 38 - ((t * 1) % 29)
        gy = 33 - ((t * 2) % 27)
        cv2.circle(image, (gx, gy), 3, (86, 232, 158), -1)
        frames.append(image)
    return np.stack(frames)


def load_phone_video():
    """Only called on opt-in; uploads files into remote Colab session."""
    try:
        from google.colab import files
    except ImportError as exc:
        raise RuntimeError("Your video upload requires Google Colab.") from exc
    print("请确认视频归你所有或已获授权。视频将上传至 Colab 云端运行环境。")
    incoming = files.upload()
    if not incoming:
        raise ValueError("没有选择视频。")
    name = next(iter(incoming))
    if len(incoming[name]) > 60 * 1024 * 1024:
        raise ValueError("为了限制 CPU/RAM 使用，请选择小于 60 MB 的短视频。")
    cap = cv2.VideoCapture(name)
    if not cap.isOpened():
        raise ValueError("无法解码视频，请使用 H.264 MP4。")
    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = fps if np.isfinite(fps) and 1 <= fps <= 240 else 25
    stride = max(1, int(round(fps / 6)))
    sampled = []
    index = 0
    max_input_frames = int(min(fps * 12, 2880))
    while index < max_input_frames:
        ok, bgr = cap.read()
        if not ok:
            break
        if index % stride == 0:
            rgb = cv2.cvtColor(cv2.resize(bgr, (SIZE, SIZE)), cv2.COLOR_BGR2RGB)
            sampled.append(rgb)
        index += 1
    cap.release()
    if len(sampled) < 24:
        raise ValueError("有效帧不足 24 帧。请上传 5–12 秒的 MP4 短视频。")
    return np.stack(sampled[:72])


frames = load_phone_video() if USE_OWN_VIDEO else create_synthetic_clip()
print("来源：", "用户上传的授权视频" if USE_OWN_VIDEO else "程序生成的示例动画")
print("采样帧数：", len(frames), "尺寸：", frames.shape[1:3])

# Split raw frames before forming training triplets: no overlap leakage.
pixels = torch.from_numpy(frames.copy()).float().permute(0, 3, 1, 2) / 255
n = len(pixels)
split = int(n * 0.70)
if split < 12 or n - split < HORIZON + 3:
    raise ValueError("视频太短，无法将训练片段与多帧测试片段分开。")
train_in = torch.stack([torch.cat([pixels[i], pixels[i+1]]) for i in range(split-2)])
train_out = torch.stack([pixels[i+2] for i in range(split-2)])


class StarflowMultiStepV0(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(6, 24, 3, padding=1), nn.ReLU(),
            nn.Conv2d(24, 32, 3, padding=1), nn.ReLU(),
            nn.Conv2d(32, 24, 3, padding=1), nn.ReLU(),
            nn.Conv2d(24, 3, 3, padding=1),
        )

    def forward(self, two_rgb_frames):
        return two_rgb_frames[:, 3:] + self.net(two_rgb_frames)


model = StarflowMultiStepV0()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
loader = DataLoader(TensorDataset(train_in, train_out), batch_size=8, shuffle=True)


def evaluate_rollouts(net):
    net.eval()
    sums_model = torch.zeros(HORIZON)
    sums_baseline = torch.zeros(HORIZON)
    starts = 0
    with torch.no_grad():
        for start in range(split, n - HORIZON - 1):
            left = pixels[start:start+1]
            right = pixels[start+1:start+2]
            held = right.clone()
            for k in range(HORIZON):
                next_frame = net(torch.cat((left, right), dim=1)).clamp(0, 1)
                true_frame = pixels[start+2+k:start+3+k]
                sums_model[k] += (next_frame - true_frame).square().mean()
                sums_baseline[k] += (held - true_frame).square().mean()
                left, right = right, next_frame
            starts += 1
    return (sums_model / starts).tolist(), (sums_baseline / starts).tolist(), starts


history = []
for epoch in range(EPOCHS):
    model.train()
    for inputs, targets in loader:
        loss = (model(inputs) - targets).square().mean()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    measured, baseline_measured, count = evaluate_rollouts(model)
    history.append(measured)
    print(f"Epoch {epoch+1:02d}/{EPOCHS}, 1-step MSE {measured[0]:.6f}, 4-step MSE {measured[-1]:.6f}")

model_mse, baseline_mse, starts = evaluate_rollouts(model)
report = {
    "experiment": "Starflow AI Lab 003",
    "dataset": "synthetic demo" if not USE_OWN_VIDEO else "user-authorized uploaded clip",
    "trained_on_pretrained_model": False,
    "uses_paid_api": False,
    "input_resolution": [SIZE, SIZE],
    "epochs": EPOCHS,
    "horizon_frames": HORIZON,
    "n_frames": n,
    "train_last_frame_index": split - 1,
    "test_first_frame_index": split,
    "test_start_positions": starts,
    "parameters": sum(p.numel() for p in model.parameters()),
    "mse_model_by_horizon": model_mse,
    "mse_freeze_last_frame_by_horizon": baseline_mse,
    "note": "An autoregressive toy-frame predictor. No human-video, 4K, 120FPS, identity, text-to-video or commercial claims.",
}
(OUTPUT_DIR / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))

# The tiny predicted sequence includes 2 observed + 4 predicted frames.
with torch.no_grad():
    a = pixels[split:split+1]
    b = pixels[split+1:split+2]
    preview = [a[0], b[0]]
    for _ in range(HORIZON):
        c = model(torch.cat((a, b), dim=1)).clamp(0, 1)
        preview.append(c[0])
        a, b = b, c

images = []
for tensor in preview:
    rgb = (tensor.permute(1, 2, 0).numpy() * 255).astype(np.uint8)
    images.append(Image.fromarray(rgb).resize((288, 288), Image.Resampling.NEAREST))
images[0].save(OUTPUT_DIR / "preview.gif", save_all=True, append_images=images[1:], duration=230, loop=0)

torch.save({"state_dict": model.state_dict(), "resolution": SIZE, "seed": SEED,
            "epochs": EPOCHS, "trained_on_user_video": USE_OWN_VIDEO},
           OUTPUT_DIR / "starflow_multistep_v0.pt")
print("完成：", list(map(str, OUTPUT_DIR.iterdir())))
