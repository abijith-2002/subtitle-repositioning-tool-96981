# -*- coding: utf-8 -*-
"""
Patched version: fix for 'last subtitle not written' in reposition_srt().
Change: allocate output_ass_file with len(subs) + 1 to match pysrt's 1-based indices.
All other behaviors and formatting are preserved.

Note: This is a minimal patch; no unrelated refactors.
"""

import os
import re
import json
import time
import logging
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import cv2
import numpy as np
import pysrt

from rapidocr_onnxruntime import RapidOCR  # OCR engine

logging.basicConfig(
    filename="Reposition_sub_7.txt",
    filemode="w",
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s",
    encoding="utf-8",
)
log = logging.getLogger()

engine = RapidOCR()
_a_frame_counter = 0  # retained for compatibility


# PUBLIC_INTERFACE
def detect_using_rapidocr(img: np.ndarray) -> List[Dict]:
    """Run RapidOCR on a preprocessed image and normalize result shape."""
    global _a_frame_counter
    print(f"a:{_a_frame_counter}")
    log.info(f"a:{_a_frame_counter}")

    results, _ = engine(img)  # results = [(box, text, score), ...]
    log.info(f"results : {results}")
    detections: List[Dict] = []
    if results:
        log.info("detections found for frame")
        for (box, text, score) in results:
            temp_result = {
                "box": box,
                "text": text,
                "score": float(score),
            }
            detections.append(temp_result)

    _a_frame_counter += 1
    return detections


# PUBLIC_INTERFACE
def to_ass_timestamp(srt_time: pysrt.SubRipTime) -> str:
    """Convert pysrt.SubRipTime to ASS H:MM:SS.CC format."""
    total_ms = (
        srt_time.hours * 3600 * 1000
        + srt_time.minutes * 60 * 1000
        + srt_time.seconds * 1000
        + srt_time.milliseconds
    )
    hours = total_ms // 3600000
    minutes = (total_ms % 3600000) // 60000
    seconds = (total_ms % 60000) // 1000
    centiseconds = (total_ms % 1000) // 10
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def preprocess_adaptive_threshold(image: np.ndarray) -> np.ndarray:
    """Prepare image for OCR using adaptive threshold."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    # Adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15,
        C=5,
    )
    return thresh


# PUBLIC_INTERFACE
def decide_subtitle_position(
    filtered_detections_list: List[List[Dict]],
    frame_height: int,
    bottom_threshold_ratio: float = 0.75,
) -> str:
    """Top if burnt-in detected in bottom, else bottom."""
    for frame_detections in filtered_detections_list:
        if frame_detections:
            for det in frame_detections:
                y_coords = [p[1] for p in det["box"]]
                avg_y = sum(y_coords) / max(len(y_coords), 1)
                if avg_y > frame_height * bottom_threshold_ratio:
                    return "top"
    return "bottom"


def get_position_for_segment(video_path: str, start_sec: float, end_sec: float, min_frames: int = 3) -> str:
    """Run OCR on sampled frames to decide top/bottom."""
    log.info("in get position for segment")
    log.info(f"start sec:{start_sec},end_sec:{end_sec}")
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps)
    sub_time = end_sec - start_sec
    required_min_frames = int(sub_time) // 2
    min_frames = max(min_frames, required_min_frames)
    log.info(f"required min frames is {required_min_frames}")
    log.info(f"min frames now {min_frames}")
    frame_indices = np.linspace(
        start_frame,
        end_frame,
        min(min_frames, abs(end_frame - start_frame + 1)),
        dtype=int,
    )

    filtered_detections_per_frame: List[List[Dict]] = []
    for frame_idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            log.info("could not obtain frame")
            continue
        preprocessed = preprocess_adaptive_threshold(frame)
        detections = detect_using_rapidocr(preprocessed)
        filtered_detections_per_frame.append(detections)
    log.info(f"filtered detections per frame{filtered_detections_per_frame}")
    cap.release()

    return decide_subtitle_position(filtered_detections_per_frame, frame_height)


from concurrent.futures import ThreadPoolExecutor, as_completed


# PUBLIC_INTERFACE
def reposition_srt(video_path: str, srt_path: str, output_ass_path: str, results: Dict, min_frames: int = 3, max_workers: int = 5) -> str:
    """Read SRT, use precomputed results, output ASS with repositioned alignment tags."""
    subs = pysrt.open(srt_path)
    if not subs:
        return output_ass_path

    # FIX: allocate +1 to align with pysrt's 1-based indices (prevents dropping the last subtitle)
    output_ass_file: List[Optional[str]] = [None] * (len(subs) + 1)

    def process_sub(sub_index: int, position: str):
        """Process one subtitle line using precomputed position."""
        sub = next((s for s in subs if s.index == sub_index), None)
        log.info(f"sub text:{sub.text if sub else 'N/A'}")
        alignment_tag = r"{\an8}" if position == "top" else r"{\an2}"

        raw_text = sub.text if sub else ""

        # Escape braces used by ASS control sequences
        safe_text = raw_text.replace("{", r"\{").replace("}", r"\}")

        # Preserve line breaks
        safe_text = safe_text.replace("\n", r"\N").replace("\\n", r"\N")

        # Map common styling tags
        tag_map = [
            (r"<i>", r"{\\i1}"),
            (r"</i>", r"{\\i0}"),
            (r"<b>", r"{\\b1}"),
            (r"</b>", r"{\\b0}"),
            (r"<u>", r"{\\u1}"),
            (r"</u>", r"{\\u0}"),
            (r"<s>", r"{\\s1}"),
            (r"</s>", r"{\\s0}"),
        ]
        for pat, repl in tag_map:
            safe_text = re.sub(pat, repl, safe_text, flags=re.IGNORECASE)

        line = (
            f"Dialogue: 0,{to_ass_timestamp(sub.start)},{to_ass_timestamp(sub.end)},"
            f"Default,,0,0,0,,{alignment_tag}{safe_text}\n"
        )
        return line, sub_index

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(
                process_sub,
                results[result].get("subtitle_index"),
                results[result].get("recommended_position"),
            ): i
            for i, result in enumerate(results)
            if results.get(result) is not None
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                line, index = future.result()
                output_ass_file[index] = line
            except Exception as e:
                log.error(f"Error processing subtitle {idx}: {e}")

    # Write results back in correct order, preserving format
    with open(output_ass_path, "w", encoding="utf-8") as f:
        f.write(
            "[Script Info]\n"
            "ScriptType: v4.00+\n"
            "PlayResX: 1920\n"
            "PlayResY: 1080\n"
            "ScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
            "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
            "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,"
            "0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )
        for i in range(len(subs)):
            if output_ass_file[i]:
                f.write(output_ass_file[i])

    log.info(f"Repositioned subtitle saved: {output_ass_path}")
    return output_ass_path


# PUBLIC_INTERFACE
def detect_text_srt(video_path: str, srt_path: str, min_frames: int = 3, max_workers: int = 5) -> Dict[int, Dict]:
    """Read SRT, run OCR per line, return dict of detections suitable for reposition_srt."""
    subs = pysrt.open(srt_path)

    def get_detections(video_path: str, start_sec: float, end_sec: float, min_frames: int = 3) -> Dict:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        start_frame = int(start_sec * fps)
        end_frame = int(end_sec * fps)
        sub_time = end_sec - start_sec
        required_min_frames = int(sub_time) // 2
        min_frames_used = max(min_frames, required_min_frames)
        frame_indices = np.linspace(start_frame, end_frame, min(min_frames_used, abs(end_frame - start_frame + 1)), dtype=int)
        analysis = []
        filtered_detections_per_frame: List[List[Dict]] = []
        for frame_idx in frame_indices:
            result = {}
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                log.info("could not obtain frame")
                continue
            preprocessed = preprocess_adaptive_threshold(frame)
            detections = detect_using_rapidocr(preprocessed)
            filtered_detections_per_frame.append(detections)
            result["frame_index"] = int(frame_idx)
            result["timestamp"] = float(frame_idx / fps) if fps else 0.0
            result["detections"] = detections
            analysis.append(result)
        cap.release()
        recommended_position = decide_subtitle_position(filtered_detections_per_frame, frame_height)
        return {"analysis": analysis, "recommended_position": recommended_position}

    def process_sub(sub: pysrt.SubRipItem, sub_index: int) -> Dict:
        start_sec = sub.start.hours * 3600 + sub.start.minutes * 60 + sub.start.seconds + sub.start.milliseconds / 1000
        end_sec = sub.end.hours * 3600 + sub.end.minutes * 60 + sub.end.seconds + sub.end.milliseconds / 1000
        detections = get_detections(video_path, start_sec, end_sec, min_frames)
        detections["subtitle_index"] = sub_index
        return detections

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {executor.submit(process_sub, sub, sub.index): i for i, sub in enumerate(subs)}
        results: Dict[int, Dict] = {}
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
                log.info("retrieved result")
            except Exception as e:
                log.error(f"Error processing subtitle {idx}: {e}")
                results[idx] = None
    return results


# PUBLIC_INTERFACE
def display_results(results: Dict) -> None:
    """Sort and dump detection results to results.json."""
    results = dict(sorted(results.items()))
    for index, result in results.items():
        log.info(f"index:{index}")
        log.info(f"result:{result}")
    with open("results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)


# PUBLIC_INTERFACE
def process_subtitle(video_path: str, subtitle_path: str, max_workers: int = 5) -> str:
    """Minimal runner to perform SRT->ASS reposition using the fixed buffer sizing."""
    start = time.time()
    ext = os.path.splitext(subtitle_path)[1].lower()
    print("in process subtitle")
    if ext == ".srt":
        results = detect_text_srt(video_path, subtitle_path, max_workers=max_workers)
        log.info(f"results:{results}")
        if results:
            display_results(results)
        else:
            print("No results")
        output_file = os.path.splitext(subtitle_path)[0] + "_repositioned.ass"
        reposition_srt(video_path, subtitle_path, output_file, results=results, max_workers=max_workers)
    else:
        raise ValueError(f"Unsupported subtitle format for this minimal patch runner: {ext}")

    log.info(f"Repositioned subtitle saved: {output_file}")
    print(f"Repositioned subtitle saved: {output_file}")
    end = time.time()
    print("total time taken", end - start)
    return output_file


if __name__ == "__main__":
    # Example paths; update as needed for local verification
    video_path = r"uploads\output.mp4"
    sub_path = r"outputs\sample.srt"
    max_workers = 4
    process_subtitle(video_path, sub_path, max_workers)
