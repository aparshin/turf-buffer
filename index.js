var featurecollection = require('turf-featurecollection');
var destination = require('turf-destination');
var bearing = require('turf-bearing');
var point = require('turf-point');
var polygon = require('turf-polygon');
var jsts = require('jsts');

module.exports = function(feature, radius, units, resolution){
  if(!resolution) resolution = 36;
  var geom = feature.geometry
  if(geom.type === 'Point') {
    return pointBuffer(feature, radius, units, resolution);
  } else if(geom.type === 'MultiPoint') {
    var buffers = [];
    geom.coordinates.forEach(function(coords) {
      buffers.push(pointBuffer(point(coords[0], coords[1]), radius, units, resolution));      
    });
    return unionPolys(buffers);
  } else if(geom.type === 'LineString') {
    return unionPolys(lineBuffer(feature, radius, units, resolution));
  } else if(geom.type === 'MultiLineString') {
    var buffers = [];
    geom.coordinates.forEach(function(lineCoords){
      var line = {geometry: {type: 'LineString', coordinates: lineCoords}};
      buffers = buffers.concat(lineBuffer(line, radius, units, resolution));
    });
    return unionPolys(buffers);
  } else if(geom.type === 'Polygon') { 
    return unionPolys(polygonBuffer(feature, radius, units, resolution));
  } else if(geom.type === 'MultiPolygon') {
    var buffers = [];
    geom.coordinates.forEach(function(polyCoords){
      var poly = {geometry: {type: 'Polygon', coordinates: polyCoords}};
      buffers = buffers.concat(polygonBuffer(poly, radius, units, resolution));
    });
    return unionPolys(buffers);
  }
}

/*create a set of boxes parallel to the segments
  
    ---------

 ((|¯¯¯¯¯¯¯¯¯|))
(((|---------|)))
 ((|_________|))

*/
function segmentBuffer(bottom, top, radius, units, resolution) {
    var direction = bearing(bottom, top);

    var bottomLeft = destination(bottom, radius, direction - 90, units);
    var bottomRight = destination(bottom, radius, direction + 90, units);
    var topLeft = destination(top, radius, direction - 90, units);
    var topRight = destination(top, radius, direction + 90, units);

    var poly = polygon([[bottomLeft.geometry.coordinates, topLeft.geometry.coordinates]]);

    // add top curve
    var spokeNum = Math.floor(resolution/2);
    var topStart = bearing(top, topLeft);
    for(var k = 1; k < spokeNum; k++) {
      var spokeDirection = topStart + (180 * (k/spokeNum))
      var spoke = destination(top, radius, spokeDirection, units);
      poly.geometry.coordinates[0].push(spoke.geometry.coordinates);
    }
    // add right edge
    poly.geometry.coordinates[0].push(topRight.geometry.coordinates)
    poly.geometry.coordinates[0].push(bottomRight.geometry.coordinates)
    //add bottom curve
    var bottomStart = bearing(bottom, bottomRight);
    for(var k = 1; k < spokeNum; k++) {
      var spokeDirection = (bottomStart + (180 * (k/spokeNum)))
      var spoke = destination(bottom, radius, spokeDirection, units);
      poly.geometry.coordinates[0].push(spoke.geometry.coordinates);
    }
    poly.geometry.coordinates[0].push(bottomLeft.geometry.coordinates)
    return poly;
}

function unionPolys (polys) {
  var reader = new jsts.io.GeoJSONReader();
  var jstsPolys = polys.map(function(poly){
    return reader.read(JSON.stringify(poly.geometry));
  })
  
  var buffer = jsts.operation.union.CascadedPolygonUnion.union(jstsPolys);
  
  var parser = new jsts.io.GeoJSONParser();
  return {
    type: 'Feature',
    geometry: parser.write(buffer)
  };
}

function pointBuffer (pt, radius, units, resolution) {
  var ring = []
  var resMultiple = 360/resolution;
  for(var i  = 0; i < resolution; i++) {
    var spoke = destination(pt, radius, i*resMultiple, units);
    ring.push(spoke.geometry.coordinates);
  }
  if((ring[0][0] !== ring[ring.length-1][0]) && (ring[0][1] != ring[ring.length-1][1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return polygon([ring])
}

function lineBuffer (line, radius, units, resolution) {
  var polys = [];
  //break line into segments
  var segments = [];
  for(var i = 0; i < line.geometry.coordinates.length-1; i++) {
    segments.push([line.geometry.coordinates[i], line.geometry.coordinates[i+1]]);
  }
  
  for(var i = 0; i < segments.length; i++) {
    var bottom = point(segments[i][0][0], segments[i][0][1]);
    var top = point(segments[i][1][0], segments[i][1][1]);

    polys.push(segmentBuffer(top, bottom, radius, units, resolution));
  }
  
  return polys;
}

function polygonBuffer(poly, radius, units, resolution) {
    var geom = poly.geometry,
        buffers = [];
        
    geom.coordinates.forEach(function(lineCoords){
      var line = {geometry: {type: 'LineString', coordinates: lineCoords}};
      buffers = buffers.concat(lineBuffer(line, radius, units, resolution));
    });
    buffers.push(poly);
    return buffers;
}