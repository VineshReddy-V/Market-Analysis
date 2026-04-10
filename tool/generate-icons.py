#!/usr/bin/env python3
"""
TechPulse Icon Generator — Pure Python PNG Creator
====================================================
Generates 16x16, 48x48, and 128x128 PNG icons for the TechPulse Chrome extension.

Uses ONLY Python standard library modules (struct, zlib, math, os).
No PIL/Pillow or any third-party packages required.

Usage:
    python generate-icons.py

Output:
    assets/icons/icon16.png
    assets/icons/icon48.png
    assets/icons/icon128.png

Design:
    Rounded square with electric blue (#4F46E5) to cyan (#06B6D4) gradient,
    containing a white lightning bolt and pulse arcs.
"""

import struct
import zlib
import math
import os


# ═══════════════════════════════════════════════════════════════════════════
# PNG Encoder (minimal, spec-compliant)
# ═══════════════════════════════════════════════════════════════════════════

def create_png(width, height, rgba_pixels):
    """
    Create a valid PNG file from RGBA pixel data.
    
    Args:
        width:  Image width in pixels
        height: Image height in pixels
        rgba_pixels: List of (r, g, b, a) tuples, row-major order
    
    Returns:
        bytes: Complete PNG file content
    """
    
    def make_chunk(chunk_type, data):
        """Build a PNG chunk with length, type, data, and CRC."""
        chunk_body = chunk_type + data
        crc = zlib.crc32(chunk_body) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + chunk_body + struct.pack('>I', crc)
    
    # PNG file signature
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR: width, height, bit_depth=8, color_type=6 (RGBA), compress=0, filter=0, interlace=0
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)
    
    # IDAT: image data rows, each prefixed with filter byte 0 (None)
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter: None
        for x in range(width):
            r, g, b, a = rgba_pixels[y * width + x]
            raw_data.extend([
                max(0, min(255, r)),
                max(0, min(255, g)),
                max(0, min(255, b)),
                max(0, min(255, a)),
            ])
    
    compressed = zlib.compress(bytes(raw_data), 9)
    idat = make_chunk(b'IDAT', compressed)
    
    # IEND: end marker
    iend = make_chunk(b'IEND', b'')
    
    return signature + ihdr + idat + iend


# ═══════════════════════════════════════════════════════════════════════════
# Geometry & Rendering Helpers
# ═══════════════════════════════════════════════════════════════════════════

def lerp(a, b, t):
    """Linear interpolation between a and b."""
    return a + (b - a) * max(0.0, min(1.0, t))


def lerp_color(c1, c2, t):
    """Linearly interpolate between two RGB colors."""
    return (
        int(lerp(c1[0], c2[0], t)),
        int(lerp(c1[1], c2[1], t)),
        int(lerp(c1[2], c2[2], t)),
    )


def distance(x1, y1, x2, y2):
    """Euclidean distance between two points."""
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def in_rounded_rect(px, py, rx, ry, rw, rh, radius):
    """Check if a pixel is inside a rounded rectangle."""
    if px < rx or px >= rx + rw or py < ry or py >= ry + rh:
        return False
    
    # Check the four corner regions
    corners = [
        (rx + radius,      ry + radius),       # top-left
        (rx + rw - radius, ry + radius),       # top-right
        (rx + radius,      ry + rh - radius),  # bottom-left
        (rx + rw - radius, ry + rh - radius),  # bottom-right
    ]
    
    in_left   = px < rx + radius
    in_right  = px >= rx + rw - radius
    in_top    = py < ry + radius
    in_bottom = py >= ry + rh - radius
    
    if in_left and in_top:
        return distance(px, py, corners[0][0], corners[0][1]) <= radius
    if in_right and in_top:
        return distance(px, py, corners[1][0], corners[1][1]) <= radius
    if in_left and in_bottom:
        return distance(px, py, corners[2][0], corners[2][1]) <= radius
    if in_right and in_bottom:
        return distance(px, py, corners[3][0], corners[3][1]) <= radius
    
    return True


def point_in_polygon(px, py, polygon):
    """
    Ray-casting algorithm for point-in-polygon test.
    polygon: list of (x, y) tuples defining the polygon vertices.
    """
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def dist_to_quadratic_bezier(px, py, p0, p1, p2, steps=30):
    """
    Approximate minimum distance from point (px,py) to a quadratic Bezier curve
    defined by control points p0, p1, p2.
    """
    min_dist = float('inf')
    for i in range(steps + 1):
        t = i / steps
        # Quadratic Bezier: B(t) = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
        mt = 1 - t
        bx = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
        by = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
        d = distance(px, py, bx, by)
        if d < min_dist:
            min_dist = d
        # Early exit optimization
        if min_dist < 0.5:
            break
    return min_dist


def alpha_blend(bg, fg, alpha):
    """Alpha-blend fg color over bg color. alpha is 0..255."""
    a = alpha / 255.0
    return (
        int(bg[0] * (1 - a) + fg[0] * a),
        int(bg[1] * (1 - a) + fg[1] * a),
        int(bg[2] * (1 - a) + fg[2] * a),
    )


# ═══════════════════════════════════════════════════════════════════════════
# Icon Renderer
# ═══════════════════════════════════════════════════════════════════════════

def render_icon(size):
    """
    Render the TechPulse icon at the given size.
    Returns a list of (r, g, b, a) tuples.
    """
    pixels = [(0, 0, 0, 0)] * (size * size)  # Start transparent
    
    s = size
    pad = max(1, round(s * 0.031))            # edge padding
    corner_r = round(s * 0.22)                 # corner radius
    rect_x, rect_y = pad, pad
    rect_w, rect_h = s - 2 * pad, s - 2 * pad
    
    # Colors
    COLOR_TL = (0x4F, 0x46, 0xE5)  # Electric blue (top-left)
    COLOR_BR = (0x06, 0xB6, 0xD4)  # Cyan (bottom-right)
    WHITE = (255, 255, 255)
    
    # Lightning bolt polygon in normalized coordinates (0..1)
    bolt_poly = [
        (0.5625, 0.125),    # top point
        (0.328,  0.531),    # left middle
        (0.453,  0.531),    # inner notch left
        (0.375,  0.875),    # bottom point
        (0.6875, 0.4375),   # right middle
        (0.531,  0.4375),   # inner notch right
    ]
    
    # Pulse arc Bezier curves (normalized) — from the SVG
    # Arc 1: M 90,48 Q 98,64 90,80  → normalized /128
    arc1 = ((90/128, 48/128), (98/128, 64/128), (90/128, 80/128))
    arc1_width_norm = 3.5 / 128  # stroke width in normalized coords
    arc1_opacity = 0.7
    
    # Arc 2: M 98,40 Q 110,64 98,88
    arc2 = ((98/128, 40/128), (110/128, 64/128), (98/128, 88/128))
    arc2_width_norm = 3.0 / 128
    arc2_opacity = 0.45
    
    for y in range(s):
        for x in range(s):
            nx = x / max(s - 1, 1)  # normalized x (0..1)
            ny = y / max(s - 1, 1)  # normalized y (0..1)
            
            # ── Step 1: Rounded square background with gradient ──
            if not in_rounded_rect(x, y, rect_x, rect_y, rect_w, rect_h, corner_r):
                continue  # pixel stays transparent
            
            # Diagonal gradient parameter
            t = (nx + ny) / 2.0
            bg_color = lerp_color(COLOR_TL, COLOR_BR, t)
            r, g, b = bg_color
            a = 255
            
            # ── Step 2: Subtle highlight on upper half for depth ──
            if ny < 0.50:
                highlight_strength = int(25 * (1.0 - ny / 0.50))  # fades down
                r = min(255, r + highlight_strength)
                g = min(255, g + highlight_strength)
                b = min(255, b + highlight_strength)
            
            # ── Step 3: Lightning bolt (white, with slight anti-aliasing) ──
            if point_in_polygon(nx, ny, bolt_poly):
                r, g, b = WHITE
                a = 255
            
            # ── Step 4: Pulse arcs ──
            # Arc 1 (closer, brighter)
            d1 = dist_to_quadratic_bezier(nx, ny, *arc1)
            half_w1 = arc1_width_norm / 2.0
            if d1 < half_w1 + (1.5 / s):
                # Smooth anti-aliased edge
                edge_alpha = max(0.0, min(1.0, (half_w1 + (1.0 / s) - d1) / (2.0 / s)))
                arc_alpha = int(255 * arc1_opacity * edge_alpha)
                blended = alpha_blend((r, g, b), WHITE, arc_alpha)
                r, g, b = blended
                a = max(a, 255)
            
            # Arc 2 (farther, dimmer)
            d2 = dist_to_quadratic_bezier(nx, ny, *arc2)
            half_w2 = arc2_width_norm / 2.0
            if d2 < half_w2 + (1.5 / s):
                edge_alpha = max(0.0, min(1.0, (half_w2 + (1.0 / s) - d2) / (2.0 / s)))
                arc_alpha = int(255 * arc2_opacity * edge_alpha)
                blended = alpha_blend((r, g, b), WHITE, arc_alpha)
                r, g, b = blended
                a = max(a, 255)
            
            # ── Step 5: Anti-alias the rounded rect edge ──
            # (Simple 1px feather on the edge for smoother look)
            edge_aa = rounded_rect_edge_alpha(
                x, y, rect_x, rect_y, rect_w, rect_h, corner_r
            )
            a = int(a * edge_aa)
            
            pixels[y * s + x] = (r, g, b, a)
    
    return pixels


def rounded_rect_edge_alpha(px, py, rx, ry, rw, rh, radius):
    """
    Return alpha multiplier (0.0 to 1.0) for anti-aliased rounded rect edges.
    """
    # Find distance to nearest corner circle if in a corner zone
    corners = [
        (rx + radius,      ry + radius),
        (rx + rw - radius, ry + radius),
        (rx + radius,      ry + rh - radius),
        (rx + rw - radius, ry + rh - radius),
    ]
    
    in_left   = px < rx + radius
    in_right  = px >= rx + rw - radius
    in_top    = py < ry + radius
    in_bottom = py >= ry + rh - radius
    
    corner_center = None
    if in_left and in_top:
        corner_center = corners[0]
    elif in_right and in_top:
        corner_center = corners[1]
    elif in_left and in_bottom:
        corner_center = corners[2]
    elif in_right and in_bottom:
        corner_center = corners[3]
    
    if corner_center is not None:
        d = distance(px, py, corner_center[0], corner_center[1])
        if d > radius:
            return 0.0
        elif d > radius - 1.0:
            return radius - d  # smooth 1px feather
    
    return 1.0


# ═══════════════════════════════════════════════════════════════════════════
# Main — Generate icon files
# ═══════════════════════════════════════════════════════════════════════════

def main():
    print()
    print("  TechPulse Icon Generator")
    print("  " + "=" * 40)
    print("  Pure Python PNG creation (no dependencies)")
    print()
    
    # Output directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(script_dir, "assets", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    sizes = [16, 48, 128]
    
    for size in sizes:
        print(f"  Rendering {size}x{size} icon...", end=" ", flush=True)
        
        # Render pixels
        pixels = render_icon(size)
        
        # Encode to PNG
        png_data = create_png(size, size, pixels)
        
        # Write file
        filename = f"icon{size}.png"
        filepath = os.path.join(icons_dir, filename)
        with open(filepath, "wb") as f:
            f.write(png_data)
        
        file_size = len(png_data)
        print(f"OK  ({file_size:,} bytes) -> {filepath}")
    
    print()
    print("  All icons generated successfully!")
    print()
    print("  Files created:")
    for size in sizes:
        p = os.path.join(icons_dir, f"icon{size}.png")
        print(f"    - {p}")
    print()
    print("  You can reference these in manifest.json as:")
    print('    "icons": {')
    for i, size in enumerate(sizes):
        comma = "," if i < len(sizes) - 1 else ""
        print(f'      "{size}": "assets/icons/icon{size}.png"{comma}')
    print("    }")
    print()


if __name__ == "__main__":
    main()
