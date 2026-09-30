import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCcw, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const CameraCapture = ({ onCapture, onCancel, actionType }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas) {
      const context = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        setCapturedImage(URL.createObjectURL(blob));
        stopCamera();
      }, 'image/jpeg');
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmPhoto = () => {
    canvasRef.current.toBlob((blob) => {
      onCapture(blob);
    }, 'image/jpeg');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[#2a2a2a] rounded-2xl p-6 border border-gray-800 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white capitalize">
          Confirmar {actionType}
        </h2>
        <Button
          onClick={onCancel}
          variant="ghost"
          size="icon"
          className="text-white hover:bg-[#1a1a1a]"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      {error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={onCancel} className="bg-[#ff8c00] hover:bg-[#ff9d1f]">
            Voltar
          </Button>
        </div>
      ) : (
        <>
          <div className="relative bg-black rounded-xl overflow-hidden mb-6">
            {!capturedImage ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto"
              />
            ) : (
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-auto"
              />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="flex gap-4">
            {!capturedImage ? (
              <Button
                onClick={capturePhoto}
                className="flex-1 bg-[#ff8c00] hover:bg-[#ff9d1f] text-white font-semibold py-4 rounded-xl"
              >
                <Camera className="w-5 h-5 mr-2" />
                Capturar Foto
              </Button>
            ) : (
              <>
                <Button
                  onClick={retakePhoto}
                  variant="outline"
                  className="flex-1 border-gray-700 text-white hover:bg-[#1a1a1a] py-4 rounded-xl"
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Repetir
                </Button>
                <Button
                  onClick={confirmPhoto}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-4 rounded-xl"
                >
                  <Check className="w-5 h-5 mr-2" />
                  Confirmar
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default CameraCapture;