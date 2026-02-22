"use client";

type VideoOrbProps = {
  src: string;
  className?: string;
};

export default function VideoOrb({ src, className }: VideoOrbProps) {
  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        src={src}
        autoPlay
        playsInline
        muted
        loop
        style={{ 
          width: "100%", 
          height: "100%", 
          objectFit: "cover", 
          display: "block",
          borderRadius: "50%"
        }}
      />
    </div>
  );
}


