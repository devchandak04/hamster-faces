import './style.css'
import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker
} from '@mediapipe/tasks-vision'

document.querySelector('#app').innerHTML = `
  <main class="app">

    <nav class="navbar">
      <div class="logo">MIRRORSKETCH<span>_</span></div>

      <div class="status">
        <span class="status-dot"></span>
        <span id="systemStatus">SYSTEM READY</span>
      </div>
    </nav>

    <section class="hero">
      <p class="eyebrow">REAL-TIME VISUAL EXPERIMENT</p>

      <h1>
        MEET YOUR<br>
        <span>DIGITAL TWIN.</span>
      </h1>

      <p class="description">
        Your camera sees you.<br>
        We turn what it sees into something weird.
      </p>

      <button id="startButton">
        <span>START CAMERA</span>
        <span class="arrow">→</span>
      </button>
    </section>

    <section class="preview">

      <div class="preview-card">
        <div class="card-header">
          <span>CAM_01</span>
          <span id="cameraStatus">WAITING</span>
        </div>

        <div class="camera-placeholder" id="cameraContainer">
          <div class="crosshair"></div>
          <p>CAMERA INPUT</p>
          <small>NO SIGNAL</small>
        </div>
      </div>

      <div class="preview-card avatar-card">
        <div class="card-header">
          <span>AVATAR_01</span>
          <span id="avatarStatus">OFFLINE</span>
        </div>

        <div class="avatar-placeholder">

          <div class="face">
            <div class="eye left-eye"></div>
            <div class="eye right-eye"></div>
            <div class="mouth"></div>
          </div>

          <p>YOUR SKETCH</p>

        </div>
      </div>

    </section>

    <footer>
      <span>BUILT FROM SCRATCH</span>
      <span>001 / MIRRORSKETCH</span>
    </footer>

  </main>
`

const startButton = document.querySelector('#startButton')
const cameraContainer = document.querySelector('#cameraContainer')
const cameraStatus = document.querySelector('#cameraStatus')
const avatarStatus = document.querySelector('#avatarStatus')
const systemStatus = document.querySelector('#systemStatus')

let faceLandmarker = null
let handLandmarker = null
let lastVideoTime = -1
let tracking = false

/*
  SMOOTHING

  Lower value = smoother but slightly slower.
  Higher value = faster but more jittery.

  0.20 is a good starting point.
*/
const SMOOTHING = 0.8

let previousFace = null
let previousHands = null


function smoothPoint(previous, current) {

  if (!previous) {
    return {
      x: current.x,
      y: current.y,
      z: current.z
    }
  }

  return {
    x: previous.x + (current.x - previous.x) * SMOOTHING,
    y: previous.y + (current.y - previous.y) * SMOOTHING,
    z: previous.z + (current.z - previous.z) * SMOOTHING
  }
}


function smoothLandmarks(previous, current) {

  if (!previous) {
    return current.map(point => ({
      x: point.x,
      y: point.y,
      z: point.z
    }))
  }

  return current.map((point, index) => {
    return smoothPoint(previous[index], point)
  })
}


const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],

  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],

  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],

  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],

  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],

  [0, 17]
]


async function createTrackers() {

  systemStatus.textContent = 'LOADING TRACKER...'

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
  )

  faceLandmarker = await FaceLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
      },

      runningMode: 'VIDEO',

      numFaces: 1
    }
  )

  handLandmarker = await HandLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
      },

      runningMode: 'VIDEO',

      numHands: 2
    }
  )

  console.log('Face tracker ready')
  console.log('Hand tracker ready')
}


function drawFace(ctx, landmarks, width, height) {

  ctx.fillStyle = '#b7ff3c'

  for (const point of landmarks) {

    const x = point.x * width
    const y = point.y * height

    ctx.beginPath()

    ctx.arc(
      x,
      y,
      1.5,
      0,
      Math.PI * 2
    )

    ctx.fill()
  }
}


function drawHands(ctx, hands, width, height) {

  for (const hand of hands) {

    ctx.strokeStyle = '#b7ff3c'
    ctx.fillStyle = '#ffffff'
    ctx.lineWidth = 2

    for (const [start, end] of HAND_CONNECTIONS) {

      const a = hand[start]
      const b = hand[end]

      const ax = a.x * width
      const ay = a.y * height

      const bx = b.x * width
      const by = b.y * height

      ctx.beginPath()

      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)

      ctx.stroke()
    }

    for (const point of hand) {

      const x = point.x * width
      const y = point.y * height

      ctx.beginPath()

      ctx.arc(
        x,
        y,
        3,
        0,
        Math.PI * 2
      )

      ctx.fill()
    }
  }
}


async function trackFrame(video, canvas, ctx) {

  if (!tracking) return

  if (video.currentTime !== lastVideoTime) {

    lastVideoTime = video.currentTime

    const timestamp = performance.now()

    const faceResults =
      faceLandmarker.detectForVideo(
        video,
        timestamp
      )

    const handResults =
      handLandmarker.detectForVideo(
        video,
        timestamp
      )


    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )


    /*
      FACE SMOOTHING
    */

    if (faceResults.faceLandmarks.length > 0) {

      const currentFace =
        faceResults.faceLandmarks[0]

      previousFace =
        smoothLandmarks(
          previousFace,
          currentFace
        )

      drawFace(
        ctx,
        previousFace,
        canvas.width,
        canvas.height
      )
    }


    /*
      HAND SMOOTHING
    */

    if (handResults.landmarks.length > 0) {

      const currentHands =
        handResults.landmarks

      if (!previousHands) {

        previousHands =
          currentHands.map(hand =>
            hand.map(point => ({
              x: point.x,
              y: point.y,
              z: point.z
            }))
          )

      } else {

        previousHands =
          currentHands.map((hand, handIndex) => {

            const previousHand =
              previousHands[handIndex]

            return smoothLandmarks(
              previousHand,
              hand
            )
          })
      }

      drawHands(
        ctx,
        previousHands,
        canvas.width,
        canvas.height
      )
    }


    /*
      TRACKING STATUS
    */

    if (
      faceResults.faceLandmarks.length > 0 ||
      handResults.landmarks.length > 0
    ) {

      avatarStatus.textContent = 'TRACKING'

    } else {

      avatarStatus.textContent = 'SEARCHING'

      previousFace = null
      previousHands = null
    }
  }


  requestAnimationFrame(() =>
    trackFrame(
      video,
      canvas,
      ctx
    )
  )
}


startButton.addEventListener(
  'click',
  async () => {

    try {

      startButton.disabled = true

      startButton.querySelector(
        'span'
      ).textContent =
        'LOADING TRACKER...'


      await createTrackers()


      const cameraStream =
        await navigator.mediaDevices.getUserMedia({

          video: {
            width: 1280,
            height: 720
          },

          audio: false
        })


      const video =
        document.createElement('video')


      video.srcObject =
        cameraStream

      video.autoplay = true
      video.playsInline = true

      video.className =
        'camera-video'


      const canvas =
        document.createElement('canvas')


      canvas.className =
        'tracking-canvas'


      cameraContainer.innerHTML = ''

      cameraContainer.appendChild(video)
      cameraContainer.appendChild(canvas)


      cameraStatus.textContent =
        'LIVE'

      systemStatus.textContent =
        'TRACKING ACTIVE'

      avatarStatus.textContent =
        'SEARCHING'


      startButton.querySelector(
        'span'
      ).textContent =
        'TRACKING ACTIVE'


      video.addEventListener(
        'loadeddata',
        () => {

          canvas.width =
            video.videoWidth

          canvas.height =
            video.videoHeight


          tracking = true


          requestAnimationFrame(
            () =>
              trackFrame(
                video,
                canvas,
                canvas.getContext('2d')
              )
          )
        }
      )


    } catch (error) {

      console.error(error)

      systemStatus.textContent =
        'TRACKER ERROR'

      cameraStatus.textContent =
        'ERROR'

      startButton.disabled =
        false

      startButton.querySelector(
        'span'
      ).textContent =
        'TRY AGAIN'

      alert(
        'Something went wrong starting the tracker.'
      )
    }
  }
)