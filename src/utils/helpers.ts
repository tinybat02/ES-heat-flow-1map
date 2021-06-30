import { Vector as VectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import { Style, Fill, Stroke, Text } from 'ol/style';
import { GeoJSON, FeatureGeojson } from '../types';

const percentageToHsl = (percentage: number) => {
  const hue = percentage * -120 + 120;
  return 'hsla(' + hue + ', 100%, 50%, 0.3)';
};

const measureObj = (obj: { [key: string]: number }) => {
  const max = Math.max(...Object.values(obj));
  const min = Math.min(...Object.values(obj));
  const range = max - min;
  return {
    min,
    range,
  };
};

export const createTransparentPolygon = (coordinates: any, label: string) => {
  const polygonFeature = new Feature({
    type: 'Polygon',
    geometry: new Polygon(coordinates).transform('EPSG:4326', 'EPSG:3857'),
  });
  polygonFeature.set('label', label);
  polygonFeature.setStyle(
    new Style({
      fill: new Fill({
        color: '#ffffff00',
      }),
    })
  );
  return polygonFeature;
};

export const createPolygonInfo = (feature: FeatureGeojson, label: string, color: string) => {
  const polygonFeature = new Feature({
    type: 'Polygon',
    geometry: new Polygon(feature.geometry.coordinates).transform('EPSG:4326', 'EPSG:3857'),
  });

  polygonFeature.setStyle(
    new Style({
      fill: new Fill({
        color: color,
      }),
      text: new Text({
        stroke: new Stroke({
          color: '#fff',
          width: 3,
        }),
        font: '15px Calibri,sans-serif',
        text: label,
      }),
    })
  );
  return polygonFeature;
};

export const createPolygonLayer = (geojson: GeoJSON) => {
  const polygons: Feature[] = [];

  geojson.features.map(feature => {
    if (feature.properties && feature.properties.name) {
      if (feature.geometry.type == 'Polygon')
        polygons.push(createTransparentPolygon(feature.geometry.coordinates, feature.properties.name));
      else if (feature.geometry.type == 'LineString')
        polygons.push(createTransparentPolygon([feature.geometry.coordinates], feature.properties.name));
    }
  });

  return new VectorLayer({
    source: new VectorSource({
      features: polygons,
    }),
    zIndex: 2,
  });
};

export const createHeatInfo = (
  geojson: GeoJSON,
  startObj: { [key: string]: number } | undefined,
  destObj: { [key: string]: number } | undefined
) => {
  const combineObj: { [key: string]: number } = {};

  const infoMapFeature: Feature[] = [];
  if (startObj && !destObj) {
    delete startObj['Corridor'];
    Object.keys(startObj).map(store => {
      if (startObj[store] > 3) {
        combineObj[store] = Math.log2(startObj[store]);
      }
    });

    const { min, range } = measureObj(combineObj);

    const listDestinations = Object.keys(combineObj);

    geojson.features.map(feature => {
      if (feature.properties && feature.properties.name && listDestinations.includes(feature.properties.name)) {
        const color =
          range == 0
            ? 'hsla(60, 100%, 50%, 0.3)'
            : percentageToHsl((combineObj[feature.properties.name] - min) / range);
        infoMapFeature.push(createPolygonInfo(feature, `To ${startObj[feature.properties.name]}`, color));
      }
    });
  } else if (!startObj && destObj) {
    delete destObj['Corridor'];
    Object.keys(destObj).map(store => {
      if (destObj[store] > 3) {
        combineObj[store] = Math.log2(destObj[store]);
      }
    });
    const { min, range } = measureObj(combineObj);

    const listSources = Object.keys(combineObj);

    geojson.features.map(feature => {
      if (feature.properties && feature.properties.name && listSources.includes(feature.properties.name)) {
        const color =
          range == 0
            ? 'hsla(60, 100%, 50%, 0.3)'
            : percentageToHsl((combineObj[feature.properties.name] - min) / range);
        infoMapFeature.push(createPolygonInfo(feature, `From ${destObj[feature.properties.name]}`, color));
      }
    });
  } else if (startObj && destObj) {
    delete startObj['Corridor'];
    delete destObj['Corridor'];
    Object.keys(startObj).map(store => {
      if (destObj[store]) {
        if (startObj[store] > 3 && destObj[store] > 3) {
          combineObj[store] = Math.log2(startObj[store] + destObj[store]);
        } else if (startObj[store] > 3 && destObj[store] <= 3) {
          combineObj[store] = Math.log2(startObj[store]);
          delete destObj[store];
        } else if (startObj[store] <= 3 && destObj[store] > 3) {
          delete startObj[store];
        }
      } else {
        if (startObj[store] > 3) {
          combineObj[store] = Math.log2(startObj[store]);
        }
      }
    });

    Object.keys(destObj).map(store => {
      if (!startObj[store]) {
        if (destObj[store] > 3) {
          combineObj[store] = Math.log2(destObj[store]);
        }
      }
    });

    const { min, range } = measureObj(combineObj);

    const allRelatedStores = Object.keys(combineObj);

    geojson.features.map(feature => {
      if (feature.properties && feature.properties.name && allRelatedStores.includes(feature.properties.name)) {
        const label =
          `${startObj[feature.properties.name] ? `To ${startObj[feature.properties.name]}` : ''}` +
          `${destObj[feature.properties.name] ? ` From ${destObj[feature.properties.name]}` : ''}`;
        const color =
          range == 0
            ? 'hsla(60, 100%, 50%, 0.3)'
            : percentageToHsl((combineObj[feature.properties.name] - min) / range);

        infoMapFeature.push(createPolygonInfo(feature, label, color));
      }
    });
  }

  return new VectorLayer({
    source: new VectorSource({
      features: infoMapFeature,
    }),
    zIndex: 3,
  });
};

export const processTransitionData = (data: any[]) => {
  const excludeArr = ['_id', '_index', '_type', 'Source', 'timestamp'];
  const startObj: { [key: string]: { [key: string]: number } } = {};
  const destObj: { [key: string]: { [key: string]: number } } = {};

  data.map(row => {
    if (!startObj[row.Source]) startObj[row.Source] = {};

    Object.keys(row).map(destination => {
      if (!excludeArr.includes(destination) && row[destination] > 0) {
        startObj[row.Source][destination]
          ? (startObj[row.Source][destination] += row[destination])
          : (startObj[row.Source][destination] = row[destination]);

        if (!destObj[destination]) destObj[destination] = {};

        destObj[destination][row.Source]
          ? (destObj[destination][row.Source] += row[destination])
          : (destObj[destination][row.Source] = row[destination]);
      }
    });
  });

  Object.keys(startObj).map(start => {
    if (Object.keys(start).length == 0) delete startObj[start];
  });

  return { startObj, destObj };
};
