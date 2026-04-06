import type { FileNode, Diagnostic } from '@/types';

export const mockFileTree: FileNode = {
  name: 'photon-engine',
  path: '/Users/deepsaint/projects/photon-engine',
  type: 'directory',
  children: [
    {
      name: 'Cargo.toml',
      path: '/Users/deepsaint/projects/photon-engine/Cargo.toml',
      type: 'file',
      language: 'toml',
    },
    {
      name: 'Cargo.lock',
      path: '/Users/deepsaint/projects/photon-engine/Cargo.lock',
      type: 'file',
      language: 'toml',
    },
    {
      name: 'fozzy.toml',
      path: '/Users/deepsaint/projects/photon-engine/fozzy.toml',
      type: 'file',
      language: 'toml',
    },
    {
      name: 'README.md',
      path: '/Users/deepsaint/projects/photon-engine/README.md',
      type: 'file',
      language: 'markdown',
    },
    {
      name: 'core',
      path: '/Users/deepsaint/projects/photon-engine/core',
      type: 'directory',
      children: [
        {
          name: 'Cargo.toml',
          path: '/Users/deepsaint/projects/photon-engine/core/Cargo.toml',
          type: 'file',
          language: 'toml',
        },
        {
          name: 'src',
          path: '/Users/deepsaint/projects/photon-engine/core/src',
          type: 'directory',
          children: [
            {
              name: 'lib.rs',
              path: '/Users/deepsaint/projects/photon-engine/core/src/lib.rs',
              type: 'file',
              language: 'rust',
            },
            {
              name: 'geometry',
              path: '/Users/deepsaint/projects/photon-engine/core/src/geometry',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/geometry/mod.rs', type: 'file', language: 'rust' },
                { name: 'ray.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/geometry/ray.rs', type: 'file', language: 'rust' },
                { name: 'sphere.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/geometry/sphere.rs', type: 'file', language: 'rust' },
                { name: 'triangle.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/geometry/triangle.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'accel',
              path: '/Users/deepsaint/projects/photon-engine/core/src/accel',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/accel/mod.rs', type: 'file', language: 'rust' },
                { name: 'bvh.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/accel/bvh.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'material',
              path: '/Users/deepsaint/projects/photon-engine/core/src/material',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/material/mod.rs', type: 'file', language: 'rust' },
                { name: 'shader.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/material/shader.rs', type: 'file', language: 'rust' },
                { name: 'pbr.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/material/pbr.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'scene',
              path: '/Users/deepsaint/projects/photon-engine/core/src/scene',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/scene/mod.rs', type: 'file', language: 'rust' },
                { name: 'graph.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/scene/graph.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'texture',
              path: '/Users/deepsaint/projects/photon-engine/core/src/texture',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/texture/mod.rs', type: 'file', language: 'rust' },
                { name: 'sampler.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/texture/sampler.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'camera',
              path: '/Users/deepsaint/projects/photon-engine/core/src/camera',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/camera/mod.rs', type: 'file', language: 'rust' },
                { name: 'projection.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/camera/projection.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'render',
              path: '/Users/deepsaint/projects/photon-engine/core/src/render',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/render/mod.rs', type: 'file', language: 'rust' },
                { name: 'pipeline.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/render/pipeline.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'gpu',
              path: '/Users/deepsaint/projects/photon-engine/core/src/gpu',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/gpu/mod.rs', type: 'file', language: 'rust' },
                { name: 'dispatch.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/gpu/dispatch.rs', type: 'file', language: 'rust' },
              ],
            },
            {
              name: 'math',
              path: '/Users/deepsaint/projects/photon-engine/core/src/math',
              type: 'directory',
              children: [
                { name: 'mod.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/math/mod.rs', type: 'file', language: 'rust' },
                { name: 'vec3.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/math/vec3.rs', type: 'file', language: 'rust' },
                { name: 'mat4.rs', path: '/Users/deepsaint/projects/photon-engine/core/src/math/mat4.rs', type: 'file', language: 'rust' },
              ],
            },
          ],
        },
        {
          name: 'tests',
          path: '/Users/deepsaint/projects/photon-engine/core/tests',
          type: 'directory',
          children: [
            {
              name: 'integration',
              path: '/Users/deepsaint/projects/photon-engine/core/tests/integration',
              type: 'directory',
              children: [
                { name: 'cornell_box.rs', path: '/Users/deepsaint/projects/photon-engine/core/tests/integration/cornell_box.rs', type: 'file', language: 'rust' },
                { name: 'simple_scene.rs', path: '/Users/deepsaint/projects/photon-engine/core/tests/integration/simple_scene.rs', type: 'file', language: 'rust' },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'ui',
      path: '/Users/deepsaint/projects/photon-engine/ui',
      type: 'directory',
      children: [
        {
          name: 'package.json',
          path: '/Users/deepsaint/projects/photon-engine/ui/package.json',
          type: 'file',
          language: 'json',
        },
        {
          name: 'tsconfig.json',
          path: '/Users/deepsaint/projects/photon-engine/ui/tsconfig.json',
          type: 'file',
          language: 'json',
        },
        {
          name: 'src',
          path: '/Users/deepsaint/projects/photon-engine/ui/src',
          type: 'directory',
          children: [
            {
              name: 'components',
              path: '/Users/deepsaint/projects/photon-engine/ui/src/components',
              type: 'directory',
              children: [
                { name: 'Viewport.tsx', path: '/Users/deepsaint/projects/photon-engine/ui/src/components/Viewport.tsx', type: 'file', language: 'typescript' },
                { name: 'Viewport.test.tsx', path: '/Users/deepsaint/projects/photon-engine/ui/src/components/Viewport.test.tsx', type: 'file', language: 'typescript' },
                { name: 'SceneTree.tsx', path: '/Users/deepsaint/projects/photon-engine/ui/src/components/SceneTree.tsx', type: 'file', language: 'typescript' },
                { name: 'SceneTree.test.tsx', path: '/Users/deepsaint/projects/photon-engine/ui/src/components/SceneTree.test.tsx', type: 'file', language: 'typescript' },
                { name: 'PropertyPanel.tsx', path: '/Users/deepsaint/projects/photon-engine/ui/src/components/PropertyPanel.tsx', type: 'file', language: 'typescript' },
                { name: 'PropertyPanel.test.tsx', path: '/Users/deepsaint/projects/photon-engine/ui/src/components/PropertyPanel.test.tsx', type: 'file', language: 'typescript' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const mockDiagnostics: Diagnostic[] = [
  {
    id: 'diag-001',
    filePath: '/Users/deepsaint/projects/photon-engine/core/src/camera/projection.rs',
    line: 77,
    column: 12,
    severity: 'error',
    message: 'assertion `left == right` failed: projection matrix element [0][0] differs by 0.001',
    source: 'fozzy-test',
  },
  {
    id: 'diag-002',
    filePath: '/Users/deepsaint/projects/photon-engine/core/src/scene/graph.rs',
    line: 310,
    column: 1,
    severity: 'warning',
    message: 'explore detected non-deterministic ordering in 3 state transitions',
    source: 'fozzy-explore',
  },
  {
    id: 'diag-003',
    filePath: '/Users/deepsaint/projects/photon-engine/ui/src/components/SceneTree.test.tsx',
    line: 67,
    column: 5,
    severity: 'error',
    message: 'Expected node order [A, C, B] after drag-drop but received [A, B, C]',
    source: 'fozzy-test',
  },
  {
    id: 'diag-004',
    filePath: '/Users/deepsaint/projects/photon-engine/core/src/render/pipeline.rs',
    line: 203,
    column: 8,
    severity: 'info',
    message: 'memory analysis clean: 0 bytes leaked, peak 248 MB',
    source: 'fozzy-memory',
  },
  {
    id: 'diag-005',
    filePath: '/Users/deepsaint/projects/photon-engine/ui/src/components/PropertyPanel.test.tsx',
    line: 12,
    column: 1,
    severity: 'warning',
    message: 'fuzz scenario marked as flaky: 2 of 50 recent runs produced different results',
    source: 'fozzy-fuzz',
  },
];

export const mockFileContent = `use crate::math::{Mat4, Vec3};

/// Perspective projection camera.
pub struct PerspectiveCamera {
    fov: f64,
    aspect: f64,
    near: f64,
    far: f64,
}

impl PerspectiveCamera {
    pub fn new(fov: f64, aspect: f64, near: f64, far: f64) -> Self {
        Self { fov, aspect, near, far }
    }

    pub fn projection_matrix(&self) -> Mat4 {
        let f = 1.0 / (self.fov.to_radians() / 2.0).tan();
        let nf = 1.0 / (self.near - self.far);

        Mat4::new([
            [f / self.aspect, 0.0, 0.0, 0.0],
            [0.0, f, 0.0, 0.0],
            [0.0, 0.0, (self.far + self.near) * nf, 2.0 * self.far * self.near * nf],
            [0.0, 0.0, -1.0, 0.0],
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camera_projection_perspective() {
        let cam = PerspectiveCamera::new(60.0, 16.0 / 9.0, 0.1, 1000.0);
        let proj = cam.projection_matrix();

        // BUG: rounding precision - 1.299 vs 1.300
        assert_eq!(proj.get(0, 0), 1.300);
    }
}
`;
