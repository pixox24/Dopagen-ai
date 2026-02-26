'use client';
import { cn } from '../../lib/utils';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'> & {
  children?: React.ReactNode;
};

export const DottedSurface = React.memo(function DottedSurface({ className, children, ...props }: DottedSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !isMounted) return;

    const container = containerRef.current;
    
    // Wait for container to have dimensions
    const initThreeJS = () => {
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;
      
      if (width === 0 || height === 0) {
        console.warn('DottedSurface: Container has no dimensions, retrying...');
        setTimeout(initThreeJS, 100);
        return;
      }

      const SEPARATION = 150;
      const AMOUNTX = 40;
      const AMOUNTY = 60;

      // Scene setup
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 2000, 10000);

      const camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000);
      camera.position.set(0, 355, 1220);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);

      container.appendChild(renderer.domElement);

      // Create geometry
      const positions: number[] = [];
      const colors: number[] = [];

      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
          const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;
          positions.push(x, 0, z);
          colors.push(0.8, 0.8, 0.8); // Light gray for dark theme
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 8,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      let count = 0;
      let animationId: number;

      const animate = () => {
        animationId = requestAnimationFrame(animate);

        const positionAttr = geometry.attributes.position;
        const posArray = positionAttr.array as Float32Array;

        let i = 0;
        for (let ix = 0; ix < AMOUNTX; ix++) {
          for (let iy = 0; iy < AMOUNTY; iy++) {
            posArray[i * 3 + 1] = Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50;
            i++;
          }
        }

        positionAttr.needsUpdate = true;
        renderer.render(scene, camera);
        count += 0.1;
      };

      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      };

      window.addEventListener('resize', handleResize);
      animate();

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    };

    // Small delay to ensure DOM is ready
    const cleanup = setTimeout(initThreeJS, 50);

    return () => {
      clearTimeout(cleanup);
    };
  }, [isMounted]);

  if (!isMounted) {
    return <div className={cn('absolute inset-0 bg-black', className)} {...props} />;
  }

  return (
    <div ref={containerRef} className={cn('absolute inset-0 z-0', className)} {...props}>
      {children}
    </div>
  );
});
