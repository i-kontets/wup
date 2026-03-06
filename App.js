import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  StatusBar, TextInput, Animated, Dimensions, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { initDatabase, getAlarms, addAlarm, deleteAlarm, getUnlockCodes } from './src/database';

const { width } = Dimensions.get('window');

// 音源ファイルを指定
const alarmSoundSource = require('./assets/sounds/alarm_loop.mp3');
const penaltySoundSource = require('./assets/sounds/penalty.mp3');

export default function App() {
  const [currentPage, setCurrentPage] = useState('list');
  const [alarms, setAlarms] = useState([]);
  const [tempTime, setTempTime] = useState(new Date());
  const [isRecurring, setIsRecurring] = useState(true);
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [countdown, setCountdown] = useState(20);
  const [now, setNow] = useState(new Date());

  const lastFiredTime = useRef("");
  const flashAnim = useRef(new Animated.Value(0)).current;
  const zoomAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hapticTimerRef = useRef(null);

  const alarmPlayer = useAudioPlayer(alarmSoundSource);
  const penaltyPlayer = useAudioPlayer(penaltySoundSource);

  useEffect(() => {
    initDatabase();
    setupAudio();
    refreshAlarms();
  }, []);

const setupAudio = async () => {
    try {
      await setAudioModeAsync({
        playsInSilentModeIOS: true,
        interruptionMode: 1,
        shouldRouteThroughEarpieceAndroid: false,
      });
      console.log("Audio mode set successfully");
    } catch (e) {
      try {
        await setAudioModeAsync({ playsInSilentModeIOS: true });
        console.log("Audio mode set with fallback");
      } catch (e2) {
        console.log("Audio mode fatal error:", e2);
      }
    }
  };
  
  useEffect(() => {
    const timer = setInterval(() => {
      const currentTime = new Date();
      setNow(currentTime);
      const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      if (timeStr !== lastFiredTime.current && currentPage === 'list') {
        const hitAlarm = alarms.find(a => a.time === timeStr);
        if (hitAlarm) {
          lastFiredTime.current = timeStr;
          triggerAlarm(hitAlarm);
        }
      }

      if (currentPage === 'alarm') {
        setCountdown((prev) => {
          if (prev <= 1) {
            refreshCode();
            return 20;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [alarms, currentPage]);

  const refreshAlarms = () => setAlarms(getAlarms());

  const refreshCode = () => {
    const codes = getUnlockCodes();
    if (codes && codes.length > 0) {
      setTargetText(codes[Math.floor(Math.random() * codes.length)].code);
    } else {
      setTargetText('起きろ！');
    }
    setUserInput('');
  };

  const triggerAlarm = (alarm) => {
    setActiveAlarm(alarm);
    setCountdown(20);
    refreshCode();

    if (alarmPlayer) {
      alarmPlayer.loop = true;
      alarmPlayer.play();
    }

    hapticTimerRef.current = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }, 600);

    setCurrentPage('alarm');
    
    Animated.loop(Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 80, useNativeDriver: false }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(zoomAnim, { toValue: 3.5, duration: 100, useNativeDriver: true }),
      Animated.timing(zoomAnim, { toValue: 0.6, duration: 150, useNativeDriver: true }),
    ])).start();
  };

  const checkUnlock = async () => {
    const normalize = (text) => {
      if (!text) return "";
      return text.trim().toLowerCase().replace(/[\s　\n\r]/g, '').replace(/[！!？?。、，．,.]/g, '').normalize('NFKC');
    };

    const cleanedInput = normalize(userInput);
    const cleanedTarget = normalize(targetText);

    console.log('--- 判定ログ ---');
    console.log('入力:', `[${userInput}]`, '-> 掃除後:', `[${cleanedInput}]`);
    console.log('正解:', `[${targetText}]`, '-> 掃除後:', `[${cleanedTarget}]`);

    if (cleanedInput === cleanedTarget && cleanedInput !== "") {
      console.log('結果: 一致！解除プロセス開始');

      try {
        if (hapticTimerRef.current) clearInterval(hapticTimerRef.current);
        if (alarmPlayer) alarmPlayer.pause();
      } catch (e) { console.log("Stop error:", e); }

      setCurrentPage('list');

      setTimeout(() => {
        if (activeAlarm && activeAlarm.is_recurring === 0) {
          deleteAlarm(activeAlarm.id);
          refreshAlarms();
        }
      }, 100);

      flashAnim.setValue(0);
      zoomAnim.setValue(1);
      setUserInput('');
      Alert.alert("起床成功", "よく打ち勝ったな。");
    } else {
      console.log('結果: 不一致');
      if (penaltyPlayer) penaltyPlayer.play();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      
      setCountdown((prev) => {
        const penaltyValue = prev - 5;
        if (penaltyValue <= 0) {
          refreshCode();
          return 20;
        }
        return penaltyValue;
      });
      setUserInput('');
      Alert.alert("寝ぼけてんの？？？？", "一致していないぞ！");
    }
  };

  const saveNewAlarm = () => {
    const timeString = tempTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    addAlarm(timeString, isRecurring);
    refreshAlarms();
    setCurrentPage('list');
  };

  const backgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FF0000', '#0000FF']
  });

  const renderListPage = () => (
    <View style={brightStyles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={brightStyles.mainClockHeader}>
        <Text style={brightStyles.mainClockLabel}>現在の時刻</Text>
        <Text style={brightStyles.mainClockValue}>
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </Text>
        <TouchableOpacity style={brightStyles.absAddBtn} onPress={() => {setTempTime(new Date()); setCurrentPage('add');}}>
          <Text style={brightStyles.absAddBtnText}>＋</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={alarms}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={brightStyles.alarmCard}>
            <View>
              <Text style={brightStyles.alarmTime}>{item.time}</Text>
              <Text style={brightStyles.alarmSub}>{item.is_recurring ? '● 毎日' : '○ 1回'}</Text>
            </View>
            <View style={brightStyles.cardRight}>
              <TouchableOpacity onPress={() => triggerAlarm(item)} style={brightStyles.testBadge}><Text style={brightStyles.testBadgeText}>テスト</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { deleteAlarm(item.id); refreshAlarms(); }}><Text style={brightStyles.deleteText}>削除</Text></TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  const renderAddPage = () => (
    <View style={[brightStyles.container, { backgroundColor: '#F2F2F7' }]}>
      <View style={brightStyles.modalHeader}>
        <TouchableOpacity onPress={() => setCurrentPage('list')} style={brightStyles.headerButton}><Text style={brightStyles.modalCancel}>キャンセル</Text></TouchableOpacity>
        <Text style={brightStyles.modalTitle}>アラーム追加</Text>
        <TouchableOpacity onPress={saveNewAlarm} style={brightStyles.headerButton}><Text style={brightStyles.modalSave}>保存</Text></TouchableOpacity>
      </View>
      <View style={brightStyles.pickerContainer}>
        <DateTimePicker 
          value={tempTime} mode="time" is24Hour={true} display="spinner" 
          onChange={(e, d) => setTempTime(d || tempTime)}
          style={brightStyles.iosPicker} 
        />
      </View>
      <View style={brightStyles.toggleWrapper}>
        <Text style={brightStyles.toggleLabel}>スケジュール</Text>
        <View style={brightStyles.segmentedControl}>
          <TouchableOpacity style={[brightStyles.segmentBtn, isRecurring && brightStyles.segmentBtnActive]} onPress={() => setIsRecurring(true)}>
            <Text style={[brightStyles.segmentText, isRecurring && brightStyles.segmentTextActive]}>毎日</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[brightStyles.segmentBtn, !isRecurring && brightStyles.segmentBtnActive]} onPress={() => setIsRecurring(false)}>
            <Text style={[brightStyles.segmentText, !isRecurring && brightStyles.segmentTextActive]}>1回のみ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderAlarmPage = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Animated.View style={[chaosStyles.missionContainer, { backgroundColor }]}>
        <StatusBar hidden />
        <View style={chaosStyles.topClockArea}>
          <Text style={chaosStyles.topClockText}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </Text>
        </View>
        <View style={chaosStyles.countdownArea}>
          <Text style={chaosStyles.countdownWarning}>ミス：マイナス5秒</Text>
          <Animated.Text style={[chaosStyles.countdownNumber, { transform: [{ scale: pulseAnim }], color: countdown <= 5 ? '#FF3B30' : '#FFEA00' }]}>
            {countdown}
          </Animated.Text>
        </View>
        <Animated.Image source={require('./assets/scary.png')} style={[chaosStyles.backgroundImage, { transform: [{ scale: zoomAnim }] }]} resizeMode="contain" />
        <View style={chaosStyles.glitchBox}>
          <Text style={chaosStyles.targetText}>{targetText}</Text>
          <TextInput 
            style={chaosStyles.input} 
            value={userInput} 
            onChangeText={setUserInput} 
            autoFocus 
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="入力せよ"
          />
          <TouchableOpacity style={chaosStyles.killBtn} onPress={checkUnlock}>
            <Text style={chaosStyles.killBtnText}>アラームを止める</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );

  if (currentPage === 'add') return renderAddPage();
  if (currentPage === 'alarm') return renderAlarmPage();
  return renderListPage();
}

//css部分
const brightStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  mainClockHeader: { marginTop: 60, paddingHorizontal: 25, paddingBottom: 30, borderBottomWidth: 1, borderBottomColor: '#F2F2F7', alignItems: 'center' },
  mainClockLabel: { fontSize: 14, color: '#8E8E93', fontWeight: 'bold', marginBottom: 5 },
  mainClockValue: { fontSize: 56, fontWeight: '200', color: '#1C1C1E' },
  absAddBtn: { position: 'absolute', right: 25, top: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: '#5856D6', justifyContent: 'center', alignItems: 'center' },
  absAddBtnText: { fontSize: 28, color: '#FFF' },
  alarmCard: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 24, marginBottom: 16, marginHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 3 },
  alarmTime: { fontSize: 48, fontWeight: '300' },
  alarmSub: { fontSize: 13, color: '#5856D6' },
  cardRight: { alignItems: 'flex-end' },
  testBadge: { backgroundColor: '#F2F2F7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 10 },
  testBadgeText: { fontSize: 11, color: '#8E8E93' },
  deleteText: { fontSize: 15, color: '#FF3B30' },
  modalHeader: { height: 60, marginTop: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalCancel: { color: '#007AFF' },
  modalSave: { color: '#007AFF', fontWeight: 'bold' },
  pickerContainer: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 24, height: 220, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  iosPicker: { width: '100%', height: '100%' },
  toggleWrapper: { marginTop: 20, marginHorizontal: 20, padding: 20, backgroundColor: '#FFF', borderRadius: 24 },
  toggleLabel: { fontSize: 15, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#F2F2F7', borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  segmentBtnActive: { backgroundColor: '#FFF' },
  segmentText: { color: '#8E8E93' },
  segmentTextActive: { color: '#5856D6', fontWeight: 'bold' }
});

const chaosStyles = StyleSheet.create({
  missionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  topClockArea: { position: 'absolute', top: 50, alignItems: 'center' },
  topClockText: { fontSize: 32, fontWeight: '900', color: '#FFF', textShadowColor: '#000', textShadowRadius: 10 },
  countdownArea: { position: 'absolute', top: 110, alignItems: 'center', zIndex: 10 },
  countdownWarning: { color: '#FFEA00', fontSize: 16, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 },
  countdownNumber: { fontSize: 70, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 15 },
  backgroundImage: { position: 'absolute', width: width * 1.5, height: width * 1.5, opacity: 0.4 },
  glitchBox: { backgroundColor: 'rgba(255, 255, 255, 0.8)', padding: 25, width: '100%', borderRadius: 20, zIndex: 1, marginTop: 120 },
  targetText: { fontSize: 30, fontWeight: '900', color: '#FF00FF', textAlign: 'center', marginBottom: 20 },
  input: { borderBottomWidth: 4, borderColor: '#000', fontSize: 24, marginBottom: 25, textAlign: 'center', padding: 10, color: '#000' },
  killBtn: { backgroundColor: '#000', padding: 20, borderRadius: 10, alignItems: 'center' },
  killBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});