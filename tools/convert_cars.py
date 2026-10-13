"""Convert the supplied OBJ/MTL car objects to self-contained GLB assets."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def convert(name):
    source = ROOT / 'models/source'
    materials = []
    names = {}
    for line in (source / (name + '.mtl')).read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == 'newmtl':
            names[parts[1]] = len(materials)
            materials.append({'name': parts[1], 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': .72}})
        elif parts[0] == 'Kd':
            materials[-1]['pbrMetallicRoughness']['baseColorFactor'][:3] = list(map(float, parts[1:4]))
    positions, normals, objects = [], [], {}
    obj, material = name, next(iter(names))
    for line in (source / (name + '.obj')).read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] in ('v', 'vn'):
            x, y, z = map(float, parts[1:4])
            (positions if parts[0] == 'v' else normals).append((-x, y, -z))
        elif parts[0] == 'o':
            obj = parts[1]
        elif parts[0] == 'usemtl':
            material = parts[1]
        elif parts[0] == 'f':
            face = [item.split('/') for item in parts[1:]]
            group = objects.setdefault(obj, {}).setdefault(material, [])
            for i in range(1, len(face) - 1):
                for vertex in (face[0], face[i], face[i+1]):
                    pi = int(vertex[0]); pos = positions[pi-1 if pi > 0 else pi]
                    ni = int(vertex[2]) if len(vertex) > 2 and vertex[2] else None
                    normal = normals[ni-1 if ni > 0 else ni] if ni else (0, 1, 0)
                    group.append((pos, normal))
    data = bytearray()
    views, accessors, meshes, nodes = [], [], [], []
    def attribute(values, bounds=False):
        offset = len(data)
        for value in values:
            data.extend(struct.pack('<3f', *value))
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)-offset, 'target': 34962})
        accessor = {'bufferView': len(views)-1, 'componentType': 5126, 'count': len(values), 'type': 'VEC3'}
        if bounds:
            accessor.update(min=[min(v[i] for v in values) for i in range(3)], max=[max(v[i] for v in values) for i in range(3)])
        accessors.append(accessor)
        return len(accessors)-1
    for obj, groups in objects.items():
        primitives = []
        for material, vertices in groups.items():
            primitives.append({'attributes': {'POSITION': attribute([v[0] for v in vertices], True), 'NORMAL': attribute([v[1] for v in vertices])}, 'material': names[material]})
        meshes.append({'name': obj, 'primitives': primitives})
        nodes.append({'name': obj, 'mesh': len(meshes)-1})
    document = {'asset': {'version': '2.0', 'generator': 'Cambridge supplied car converter'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': materials, 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(data)}]}
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    data += b'\0' * (-len(data) % 4)
    result = struct.pack('<III', 0x46546C67, 2, 12+8+len(encoded)+8+len(data))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(data), 0x004E4942) + data
    (ROOT / 'models' / (name + '.glb')).write_bytes(result)
    print(name, len(result), 'bytes')

if __name__ == '__main__':
    for model in ['NormalCar1', 'NormalCar2', 'SUV', 'SportsCar', 'SportsCar2', 'Taxi', 'Cop']:
        convert(model)
