import os
import io
import qrcode
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, send_file, abort, redirect, url_for, session

from firebase_config import (
    initialize_firebase,
    is_firebase_ready,
    save_memory,
    get_all_memories,
    delete_memory,
)

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "eya-houcem-wedding-secret-2024")

initialize_firebase()

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "eya_houcem_2024")
GALLERY_PASSWORD = os.getenv("GALLERY_PASSWORD", "2024")


@app.route("/")
def index():
    firebase_ready = is_firebase_ready()
    return render_template("index.html", firebase_ready=firebase_ready)


@app.route("/gallery", methods=["GET", "POST"])
def gallery():
    if request.method == "POST":
        password = request.form.get("password", "")
        if password == GALLERY_PASSWORD:
            session["gallery_logged_in"] = True
            return redirect(url_for("gallery"))
        else:
            return render_template("gallery_login.html", error="Incorrect password")

    if not session.get("gallery_logged_in", False):
        return render_template("gallery_login.html")

    memories = get_all_memories()
    return render_template("gallery.html", memories=memories)


@app.route("/gallery/logout")
def gallery_logout():
    session.pop("gallery_logged_in", None)
    return redirect(url_for("gallery"))


@app.route("/save-memory", methods=["POST"])
def save_memory_route():
    try:
        data = request.get_json()
        photo_data = data.get("photo", "")
        name = data.get("name", "Anonymous").strip() or "Anonymous"
        comment = data.get("comment", "").strip()

        if not photo_data:
            return jsonify({"success": False, "error": "Photo is required"}), 400

        result = save_memory(photo_data, name, comment)
        return jsonify({"success": True, "memory": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/memories", methods=["GET"])
def api_memories():
    memories = get_all_memories()
    return jsonify({"success": True, "memories": memories})


DELETE_PASSWORD = os.getenv("DELETE_PASSWORD", "1993")


@app.route("/api/delete-memory", methods=["POST"])
def api_delete_memory():
    try:
        data = request.get_json(silent=True) or {}
        memory_id = (data.get("id") or "").strip()
        password = str(data.get("password") or "").strip()

        if not memory_id:
            return jsonify({"success": False, "error": "Memory ID required"}), 400

        if password != DELETE_PASSWORD:
            return jsonify({"success": False, "error": "Incorrect password"}), 403

        result = delete_memory(memory_id)
        if result.get("success"):
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "error": "Memory not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/admin/qrcode", methods=["GET", "POST"])
def admin_qrcode():
    if request.method == "POST":
        password = request.form.get("password", "")
        if password == ADMIN_PASSWORD:
            session["admin_logged_in"] = True
            return redirect(url_for("admin_qrcode"))
        else:
            return render_template("admin_login.html", error="Incorrect password")

    if not session.get("admin_logged_in", False):
        return render_template("admin_login.html")

    site_url = request.url_root.rstrip("/")
    qr_img = qrcode.make(site_url)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    buffer.seek(0)
    qr_b64 = _encode_image_to_base64(buffer)

    gallery_url = f"{site_url}/gallery"
    gallery_qr_img = qrcode.make(gallery_url)
    gallery_buffer = io.BytesIO()
    gallery_qr_img.save(gallery_buffer, format="PNG")
    gallery_buffer.seek(0)
    gallery_qr_b64 = _encode_image_to_base64(gallery_buffer)

    memories = get_all_memories()
    return render_template(
        "admin_qrcode.html",
        site_url=site_url,
        gallery_url=gallery_url,
        qr_code=qr_b64,
        gallery_qr_code=gallery_qr_b64,
        memory_count=len(memories),
    )


@app.route("/admin/logout")
def admin_logout():
    session.pop("admin_logged_in", None)
    return redirect(url_for("index"))


@app.route("/download-qrcode/site")
def download_site_qrcode():
    if not session.get("admin_logged_in", False):
        abort(403)
    site_url = request.url_root.rstrip("/")
    qr_img = qrcode.make(site_url)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype="image/png",
        as_attachment=True,
        download_name="eya-houcem-wedding-qrcode.png",
    )


@app.route("/download-qrcode/gallery")
def download_gallery_qrcode():
    if not session.get("admin_logged_in", False):
        abort(403)
    site_url = request.url_root.rstrip("/")
    gallery_url = f"{site_url}/gallery"
    qr_img = qrcode.make(gallery_url)
    buffer = io.BytesIO()
    qr_img.save(buffer, format="PNG")
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype="image/png",
        as_attachment=True,
        download_name="eya-houcem-gallery-qrcode.png",
    )


def _encode_image_to_base64(buffer):
    import base64
    return base64.b64encode(buffer.read()).decode("utf-8")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
