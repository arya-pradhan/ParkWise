from flask import send_from_directory
from flask import Flask, flash, request, redirect, url_for
from werkzeug.utils import secure_filename
from flask import render_template
from url_utils import get_base_url
import os
import torch
import random
import cv2

random.seed(10)


# setup the webserver
# port may need to be changed if there are multiple flask servers running on same server
port = 12345 # 12346
base_url = get_base_url(port)

# if the base url is not empty, then the server is running in development, and we need to specify the static folder so that the static files are served
if base_url == '/':
    app = Flask(__name__)
else:
    app = Flask(__name__, static_url_path=base_url+'static')
    
app.secret_key = "gUG*7BNmM*[*hUd7&y6hb}GlTcub`C"


UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = set(['png', 'jpg', 'jpeg'])

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

model = torch.hub.load("ultralytics/yolov5", "custom", path = 'best.pt', force_reload=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route(f"{base_url}/about")
def about():
    return render_template("about.html")

@app.route(f"{base_url}")
def home():
    return render_template("index.html")

@app.route(f'{base_url}/try-it-out', methods=['GET', 'POST'])
def submit_file():
    if request.method == 'POST':
        # check if the post request has the file part
        print("FILES: ", request.files)
        if 'file' not in request.files:
            flash('No file part')
            return redirect(request.url)

        file = request.files['file']
        # if user does not select file, browser also
        # submit an empty part without filename
        if file.filename == '':
            flash('No selected file')
            return redirect(request.url)

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            return redirect(url_for('uploaded_file',
                                    filename=filename))

    return render_template('try-it-out.html')


@app.route(f'{base_url}/beta-video', methods=['GET', 'POST'])
def submit_video_link():
    if request.method == 'POST':
        inp = request.form['link']
        if 'https://you' and '.com' in inp:
            url = inp[-1:-10]
            return redirect(url_for('uploaded_video', file_url=url, org_url=inp))

@app.route(f'{base_url}/video-results?filename=<file_url>')
def uploaded_video(file_url, org_url):
    here = os.getcwd()
    cap = cv2.VideoCapture(file_url)
    all_frames = []
    idx = 0
    while(cap.isOpened()):
        ret, image = cap.read()
        frame_path = os.path.join(here, app.config['UPLOAD_FOLDER'], file_url, str(idx)+'.jpg')
        cv2.imwrite(frame_path, image)
        idx+=1
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    
    main_pth =  os.path.join(here, app.config['UPLOAD_FOLDER'], file_url)
    for frame_pth in os.listdir(main_pth):
        results = model(frame_pth, size=416)
        if len(results.pandas().xyxy) > 0:
            results.print()
            save_dir = os.path.join(here, app.config['UPLOAD_FOLDER'], file_url, 'annotated')
            results.save(save_dir=save_dir)
            confid = list(results.pandas().xyxy[0]['confidence'])
            lab = list(results.pandas().xyxy[0]['name'])
        else:
            pass
        
        def write_video(file_path, frames, fps):
            """
            Writes frames to an mp4 video file
            :param file_path: Path to output video, must end with .mp4
            :param frames: List of PIL.Image objects
            :param fps: Desired frame rate
            """

            w, h = frames[0].size
            fourcc = cv.VideoWriter_fourcc('m', 'p', '4', 'v')
            writer = cv.VideoWriter(file_path, fourcc, fps, (w, h))

            for frame in frames:
                writer.write(pil_to_cv(frame))

            writer.release() 
    
    
@app.route(f'{base_url}/prediction-results?filename=<filename>')
def uploaded_file(filename):
    here = os.getcwd()
    image_path = os.path.join(here, app.config['UPLOAD_FOLDER'], filename)
    results = model(image_path, size=416)
    if len(results.pandas().xyxy) > 0:
        results.print()
        save_dir = os.path.join(here, app.config['UPLOAD_FOLDER'], "annotated")
        results.save(save_dir=save_dir)
        def and_syntax(alist):
            if len(alist) == 1:
                alist = "".join(alist)
                return alist
            elif len(alist) == 2:
                alist = " and ".join(alist)
                return alist
            elif len(alist) > 2:
                alist[-1] = "and " + alist[-1]
                alist = ", ".join(alist)
                return alist
            else:
                return
        confidences = list(results.pandas().xyxy[0]['confidence'])
        # confidences: rounding and changing to percent, putting in function
        format_confidences = []
        for percent in confidences:
            format_confidences.append(str(round(percent*100)) + '%')
        format_confidences = and_syntax(format_confidences)
        
        labels = list(results.pandas().xyxy[0]['name'])
        # labels: sorting and capitalizing, putting into function
        labels = set(labels)
        labels = [emotion.capitalize() for emotion in labels]
        labels = and_syntax(labels)
        return render_template('prediction_results.html', confidences=format_confidences, labels=labels,
                               old_filename=filename,
                               filename=filename)
    else:
        found = False
        return render_template('prediction_results.html', labels='No Parking Spots', old_filename=filename, filename=filename)


@app.route(f'{base_url}/uploads/<path:filename>')
def files(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, as_attachment=True)

# define additional routes here
# for example:
# @app.route(f'{base_url}/team_members')
# def team_members():
#     return render_template('team_members.html') # would need to actually make this page

if __name__ == '__main__':
    # IMPORTANT: change url to the site where you are editing this file.
    website_url = 'cocalc18.ai-camp.dev/'
    print(f'Try to open\n\n    https://{website_url}' + base_url + '\n\n')
    app.run(host = '0.0.0.0', port=port, debug=True)
